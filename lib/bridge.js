const fs = require('fs');
const EventEmitter = require('events');

const Q = require('q');
const _ = require('busyman');
const zclId = require('zigbee-bridge-definitions');
const proving = require('proving');
const Objectbox = require('objectbox');
const debug = {
    bridge: require('debug')('zigbee-bridge'),
};

const af = require('./components/af');
const zutils = require('./components/zutils');
const loader = require('./components/loader');
const Controller = require('./controller');
const eventHandlers = require('./components/event_handlers');

const Device = require('./model/device');
const Coordinator = require('./model/coord');
const Coordpoint = require('./model/coordpoint');

/*************************************************************************************************/
/*** Bridge Class                                                                           ***/
/*************************************************************************************************/
module.exports = class Bridge extends EventEmitter {

    constructor(path, opts) {
        super();

        // opts: { sp: {}, net: {}, dbPath: 'xxx' }
        const spCfg = {};

        opts = opts || {};

        proving.string(path, 'path should be a string.');
        proving.object(opts, 'opts should be an object if gieven.');

        spCfg.path = path;
        spCfg.options = opts.hasOwnProperty('sp') ? opts.sp : { baudrate: 115200, rtscts: true };

        /***************************************************/
        /*** Protected Members                           ***/
        /***************************************************/
        this._startTime = 0;
        this._enabled = false;
        this._zApp = [];
        this._mounting = false;
        this._mountQueue = [];
        this.controller = new Controller(this, spCfg);    // controller is the main actor
        this.controller.setNvParams(opts.net);
        this.af = null;

        this._dbPath = opts.dbPath;

        if (!this._dbPath) {    // use default
            this._dbPath = __dirname + '/database/dev.db';
            // create default db folder if not there
            try {
                fs.statSync(__dirname + '/database');
            } catch (e) {
                fs.mkdirSync(__dirname + '/database');
            }
        }

        this._devbox = new Objectbox(this._dbPath);

        this.acceptDevIncoming = function (devInfo, callback) {  // Override at will.
            setImmediate(function () {
                var accepted = true;
                callback(null, accepted);
            });
        };

        /***************************************************/
        /*** Event Handlers (Ind Event Bridges)          ***/
        /***************************************************/
        eventHandlers.attachEventHandlers(this);

        this.controller.on('permitJoining', (time) => {
            this.emit('permitJoining', time);
        });

        this.on('_ready', () => {
            this._startTime = Math.floor(Date.now()/1000);
            setImmediate(() => this.emit('ready'));
        });

        this.on('ind:incoming', (dev) => {
            var endpoints = [];

            _.forEach(dev.epList, function (epId) {
                endpoints.push(dev.getEndpoint(epId));
            });

            this.emit('ind', {
                type: 'devIncoming',
                endpoints: endpoints,
                data: dev.getIeeeAddr(),
            });
        });

        this.on('ind:interview', (dev, status) => {
            this.emit('ind', {
                type: 'devInterview',
                status: status,
                data: dev,
            });
        });

        this.on('ind:leaving', (epList, ieeeAddr) => {
            this.emit('ind', {
                type: 'devLeaving',
                endpoints: epList,
                data: ieeeAddr,
            });
        });

        this.on('ind:changed', (ep, notifData) => {
            this.emit('ind', {
                type: 'devChange',
                endpoints: [ ep ],
                data: notifData,
            });
        });

        this.on('ind:reported', (ep, cId, attrs) => {
            var cIdString = zclId.cluster(cId),
                notifData = {
                    cid: '',
                    data: {}
                };

            this._updateFinalizer(ep, cId, attrs, true);

            cIdString = cIdString ? cIdString.key : cId;
            notifData.cid = cIdString;

            _.forEach(attrs, function (rec) {  // { attrId, dataType, attrData }
                var attrIdString = zclId.attr(cIdString, rec.attrId);
                attrIdString = attrIdString ? attrIdString.key : rec.attrId;

                notifData.data[attrIdString] = rec.attrData;
            });

            this.emit('ind', {
                type: 'attReport',
                endpoints: [ ep ],
                data: notifData,
            });
        });

        this.on('ind:status', (dev, status) => {
            var endpoints = [];

            _.forEach(dev.epList, function (epId) {
                endpoints.push(dev.getEndpoint(epId));
            });

            this.emit('ind', {
                type: 'devStatus',
                endpoints: endpoints,
                data: status,
            });
        });
    }

    /*************************************************************************************************/
    /*** Public Methods                                                                            ***/
    /*************************************************************************************************/
    start(callback) {
        callback || (callback = () => {});

        return Promise.resolve()
            .then(() => this.controller.start())
            .then(() => {
                this.af = af(this.controller);
            })
            .then(() => this.controller.request('ZDO', 'mgmtPermitJoinReq', {
                addrmode: 0x02,
                dstaddr: 0 ,
                duration: 0,
                tcsignificance: 0,
            }))
            .then(() => this._registerDev(this.controller.getCoord()))
            .then(() => loader.reload(this))
            .then(() => {
                const netInfo = this.controller.getNetInfo();

                debug.bridge('Loading devices from database done.');
                debug.bridge('zigbee-bridge is up and ready.');
                debug.bridge('Network information:');
                debug.bridge(' >> State:      %s', netInfo.state);
                debug.bridge(' >> Channel:    %s', netInfo.channel);
                debug.bridge(' >> PanId:      %s', netInfo.panId);
                debug.bridge(' >> Nwk Addr:   %s', netInfo.nwkAddr);
                debug.bridge(' >> Ieee Addr:  %s', netInfo.ieeeAddr);
                debug.bridge(' >> Ext. PanId: %s', netInfo.extPanId);
            })
            .then(() => {
                var devs = this._devbox.exportAllObjs();

                devs.forEach((dev) => {
                    if (dev.getNwkAddr() !== 0) {
                        return this.controller.checkOnline(dev);
                    }
                });
            })
            .then(() => {
                // bridge is enabled
                this._enabled = true;
                // if all done, bridge fires '_ready' event for inner use
                this.emit('_ready');
            })
            .then((result) => callback(undefined, result))
            .catch((e) => callback(e));
    }

    stop(callback) {
        callback || (callback = () => {});

        let devbox = this._devbox;

        return Promise.resolve()
            .then(() => {
                if (!this._enabled) return;

                this.permitJoin(0x00, 'all');
                _.forEach(devbox.exportAllIds(), function (id) {
                    this._devbox.removeElement(id);
                });

                return this.controller.close();
            })
            .then(() => {
                this._enabled = false;
                this._zApp = null;
                this._zApp = [];
            })
            .then((result) => callback(undefined, result))
            .catch((e) => callback(e));
    }

    acceptDevIncoming(devInfo, callback) {
        setImmediate(() => callback(null, true));
    };

    reset(mode, callback) {
        proving.stringOrNumber(mode, 'mode should be a number or a string.');

        if (mode === 'hard' || mode === 0) {
            // clear database
            if (this._devbox) {
                const removeDevs = this._devbox.exportAllIds()
                    .map((id) => new Promise((resolve, reject) => {
                        this._devbox.remove(id, (err) => {
                            if (err) return reject();
                            resolve();
                        })
                    }));

                Promise.all(removeDevs)
                    .then(() => {
                        if (this._devbox.isEmpty()) {
                            debug.bridge('Database cleared.');
                        } else {
                            debug.bridge('Database not cleared.');
                        }
                    })
                    .catch((err) => debug.bridge(err));
            } else {
                this._devbox = new Objectbox(this._dbPath);
            }
        }

        return this.controller.reset(mode, callback);
    }

    permitJoin(time, type, callback) {
        if (_.isFunction(type) && !_.isFunction(callback)) {
            callback = type;
            type = 'all';
        } else {
            type = type || 'all';
        }

        if (!this._enabled){
            return Q.reject(new Error('bridge is not enabled.')).nodeify(callback);
        }

        return this.controller.permitJoin(time, type, callback);
    }

    info() {
        var net = this.controller.getNetInfo();

        return {
            enabled: this._enabled,
            net: {
                state: net.state,
                channel: net.channel,
                panId: net.panId,
                extPanId: net.extPanId,
                ieeeAddr: net.ieeeAddr,
                nwkAddr: net.nwkAddr,
            },
            startTime: this._startTime,
            joinTimeLeft: net.joinTimeLeft
        };
    }

    mount(zApp, callback) {
        var self = this,
            deferred = (callback && Q.isPromise(callback.promise)) ? callback : Q.defer(),
            coord = this.controller.getCoord(),
            mountId,
            loEp;

        if (zApp.constructor.name !== 'Zive')
            throw new TypeError('zApp should be an instance of Zive class.');

        if (this._mounting) {
            this._mountQueue.push(function () {
                self.mount(zApp, deferred);
            });
            return deferred.promise.nodeify(callback);
        }

        this._mounting = true;

        Q.fcall(function () {
            _.forEach(self._zApp, function (app) {
                if (app === zApp)
                    throw new  Error('zApp already exists.');
            });
            self._zApp.push(zApp);
        }).then(function () {
            if (coord) {
                mountId = Math.max.apply(null, coord.epList);
                zApp._simpleDesc.epId = mountId > 10 ? mountId + 1 : 11;  // epId 1-10 are reserved for delegator
                loEp = new Coordpoint(coord, zApp._simpleDesc);
                loEp.clusters = zApp.clusters;
                coord.endpoints[loEp.getEpId()] = loEp;
                zApp._endpoint = loEp;
            } else {
                throw new Error('Coordinator has not been initialized yet.');
            }
        }).then(function () {
            return self.controller.registerEp(loEp).then(function () {
                debug.bridge('Register zApp, epId: %s, profId: %s ', loEp.getEpId(), loEp.getProfId());
            });
        }).then(function () {
            return self.controller.querie.coordInfo().then(function (coordInfo) {
                coord.update(coordInfo);
                return Q.ninvoke(self._devbox, 'sync', coord._getId());
            });
        }).then(function () {
            self._attachZclMethods(loEp);
            self._attachZclMethods(zApp);

            loEp.onZclFoundation = function (msg, remoteEp) {
                setImmediate(function () {
                    return zApp.foundationHandler(msg, remoteEp);
                });
            };
            loEp.onZclFunctional = function (msg, remoteEp) {
                setImmediate(function () {
                    return zApp.functionalHandler(msg, remoteEp);
                });
            };

            deferred.resolve(loEp.getEpId());
        }).fail(function (err) {
            deferred.reject(err);
        }).done(function () {
            self._mounting = false;
            if (self._mountQueue.length)
                process.nextTick(function () {
                    self._mountQueue.shift()();
                });
        });

        if (!(callback && Q.isPromise(callback.promise)))
            return deferred.promise.nodeify(callback);
    }

    list(ieeeAddrs) {
        var self = this,
            foundDevs;

        if (_.isString(ieeeAddrs))
            ieeeAddrs = [ ieeeAddrs ];
        else if (!_.isUndefined(ieeeAddrs) && !_.isArray(ieeeAddrs))
            throw new TypeError('ieeeAddrs should be a string or an array of strings if given.');
        else if (!ieeeAddrs)
            ieeeAddrs = _.map(this._devbox.exportAllObjs(), function (dev) {
                return dev.getIeeeAddr();  // list all
            });

        foundDevs = _.map(ieeeAddrs, function (ieeeAddr) {
            proving.string(ieeeAddr, 'ieeeAddr should be a string.');

            var devInfo,
                found = self._findDevByAddr(ieeeAddr);

            if (found)
                devInfo = _.omit(found.dump(), [ 'id', 'endpoints' ]);

            return devInfo;  // will push undefined to foundDevs array if not found
        });

        return foundDevs;
    }

    find(addr, epId) {
        proving.number(epId, 'epId should be a number.');

        var dev = this._findDevByAddr(addr);
        return dev ? dev.getEndpoint(epId) : undefined;
    }

    lqi(ieeeAddr, callback) {
        proving.string(ieeeAddr, 'ieeeAddr should be a string.');

        var self = this,
            dev = this._findDevByAddr(ieeeAddr);

        return Q.fcall(function () {
            if (dev)
                return self.controller.request('ZDO', 'mgmtLqiReq', { dstaddr: dev.getNwkAddr(), startindex: 0 });
            else
                return Q.reject(new Error('device is not found.'));
        }).then(function (rsp) {   // { srcaddr, status, neighbortableentries, startindex, neighborlqilistcount, neighborlqilist }
            if (rsp.status === 0)  // success
                return _.map(rsp.neighborlqilist, function (neighbor) {
                    return { ieeeAddr: neighbor.extAddr, lqi: neighbor.lqi };
                });
        }).nodeify(callback);
    }

    remove(ieeeAddr, cfg, callback) {
        proving.string(ieeeAddr, 'ieeeAddr should be a string.');

        var dev = this._findDevByAddr(ieeeAddr);

        if (_.isFunction(cfg) && !_.isFunction(callback)) {
            callback = cfg;
            cfg = {};
        } else {
            cfg = cfg || {};
        }

        if (!dev)
            return Q.reject(new Error('device is not found.')).nodeify(callback);
        else
            return this.controller.remove(dev, cfg, callback);
    }

    /*************************************************************************************************/
    /*** Protected Methods                                                                         ***/
    /*************************************************************************************************/
    _findDevByAddr(addr) {
        // addr: ieeeAddr(String) or nwkAddr(Number)
        proving.stringOrNumber(addr, 'addr should be a number or a string.');

        return this._devbox.find(function (dev) {
            return _.isString(addr) ? dev.getIeeeAddr() === addr : dev.getNwkAddr() === addr;
        });
    }

    _registerDev(dev, callback) {
        var devbox = this._devbox,
            oldDev;

        if (!(dev instanceof Device) && !(dev instanceof Coordinator))
            throw new TypeError('dev should be an instance of Device class.');

        oldDev = _.isNil(dev._getId()) ? undefined : devbox.get(dev._getId());

        return Q.fcall(function () {
            if (oldDev) {
                throw new Error('dev exists, unregister it first.');
            } else if (dev._recovered) {
                return Q.ninvoke(devbox, 'set', dev._getId(), dev).then(function (id) {
                    dev._recovered = false;
                    delete dev._recovered;
                    return id;
                });
            } else {
                dev.update({ joinTime: Math.floor(Date.now()/1000) });
                return Q.ninvoke(devbox, 'add', dev).then(function (id) {
                    dev._setId(id);
                    return id;
                });
            }
        }).nodeify(callback);
    }

    _unregisterDev(dev, callback) {
        return Q.ninvoke(this._devbox, 'remove', dev._getId()).nodeify(callback);
    }

    _attachZclMethods(ep) {
        var self = this;

        if (ep.constructor.name === 'Zive') {
            var zApp = ep;
            zApp.foundation = function (dstAddr, dstEpId, cId, cmd, zclData, cfg, callback) {
                var dstEp = self.find(dstAddr, dstEpId);

                if (typeof cfg === 'function') {
                    callback = cfg;
                    cfg = {};
                }

                if (!dstEp)
                    return Q.reject(new Error('dstEp is not found.')).nodeify(callback);
                else
                    return self._foundation(zApp._endpoint, dstEp, cId, cmd, zclData, cfg, callback);
            };

            zApp.functional = function (dstAddr, dstEpId, cId, cmd, zclData, cfg, callback) {
                var dstEp = self.find(dstAddr, dstEpId);

                if (typeof cfg === 'function') {
                    callback = cfg;
                    cfg = {};
                }

                if (!dstEp)
                    return Q.reject(new Error('dstEp is not found.')).nodeify(callback);
                else
                    return self._functional(zApp._endpoint, dstEp, cId, cmd, zclData, cfg, callback);
            };
        } else {
            ep.foundation = function (cId, cmd, zclData, cfg, callback) {
                return self._foundation(ep, ep, cId, cmd, zclData, cfg, callback);
            };
            ep.functional = function (cId, cmd, zclData, cfg, callback) {
                return self._functional(ep, ep, cId, cmd, zclData, cfg, callback);
            };
            ep.bind = function (cId, dstEpOrGrpId, callback) {
                return self.controller.bind(ep, cId, dstEpOrGrpId, callback);
            };
            ep.unbind = function (cId, dstEpOrGrpId, callback) {
                return self.controller.unbind(ep, cId, dstEpOrGrpId, callback);
            };
            ep.read = function (cId, attrIdOrDef, callback) {
                const deferred = Q.defer();
                const attr = zutils.parseClusterAttr(cId, attrIdOrDef);

                self._foundation(ep, ep, cId, 'read', [{ attrId: attr.id }]).then((readStatusRecsRsp) => {
                    const rec = readStatusRecsRsp[0];
                    if (rec.status === 0) {
                        deferred.resolve(rec.attrData);
                    } else {
                        deferred.reject(new Error('request unsuccess: ' + rec.status));
                    }
                }).catch((err) => {
                    deferred.reject(err);
                });

                return deferred.promise.nodeify(callback);
            };
            ep.write = function (cId, attrIdOrDef, data, callback) {
                const deferred = Q.defer();
                const attr = zutils.parseClusterAttr(cId, attrIdOrDef);
                const writeRec = [{
                    attrId: attr.id,
                    dataType: attr.type,
                    attrData: data }
                ];

                self._foundation(ep, ep, cId, 'write', [writeRec]).then((writeStatusRecsRsp) => {
                    const rec = writeStatusRecsRsp[0];
                    if (rec.status === 0) {
                        deferred.resolve(data);
                    } else {
                        deferred.reject(new Error('request unsuccess: ' + rec.status));
                    }
                }).catch((err) => {
                    deferred.reject(err);
                });

                return deferred.promise.nodeify(callback);
            };
            ep.report = function (cId, attrIdOrDef, minInt, maxInt, repChange, callback) {
                const deferred = Q.defer();
                const coord = self.controller.getCoord();
                const dlgEp = coord.getDelegator(ep.getProfId());
                let cfgRpt = true;

                if (arguments.length === 1) {
                    cfgRpt = false;
                } else if (arguments.length === 2) {
                    callback = attrIdOrDef;
                    cfgRpt = false;
                } else if (arguments.length === 5 && _.isFunction(repChange)) {
                    callback = repChange;
                }

                if (cfgRpt) {
                    const attr = zutils.parseClusterAttr(cId, attrIdOrDef);
                    cfgRptRec = {
                        direction : 0,
                        attrId: attr.id,
                        dataType : attr.type,
                        minRepIntval : minInt,
                        maxRepIntval : maxInt,
                        repChange: repChange
                    };
                }

                Q.fcall(() => {
                    if (dlgEp) {
                        return ep.bind(cId, dlgEp).then(() => {
                            if (cfgRpt)
                                return ep.foundation(cId, 'configReport', [cfgRptRec]).then((rsp) => {
                                    const status = rsp[0].status;
                                    if (status !== 0) {
                                        deferred.reject(zclId.status(status).key);
                                    }
                                });
                        });
                    } else {
                        return Q.reject(new Error('Profile: ' + ep.getProfId() + ' is not supported.'));
                    }
                }).then(() => {
                    deferred.resolve();
                }).fail((err) => {
                    deferred.reject(err);
                }).done();

                return deferred.promise.nodeify(callback);
            };
        }
    }

    _foundation(srcEp, dstEp, cId, cmd, zclData, cfg, callback) {
        var self = this;

        if (_.isFunction(cfg) && !_.isFunction(callback)) {
            callback = cfg;
            cfg = {};
        } else {
            cfg = cfg || {};
        }

        return this.af.zclFoundation(srcEp, dstEp, cId, cmd, zclData, cfg).then(function (msg) {
            var cmdString = zclId.foundation(cmd);
            cmdString = cmdString ? cmdString.key : cmd;

            if (cmdString === 'read')
                self._updateFinalizer(dstEp, cId, msg.payload);
            else if (cmdString === 'write' || cmdString === 'writeUndiv' || cmdString === 'writeNoRsp')
                self._updateFinalizer(dstEp, cId);

            return msg.payload;
        }).nodeify(callback);
    }

    _functional(srcEp, dstEp, cId, cmd, zclData, cfg, callback) {
        var self = this;

        if (_.isFunction(cfg) && !_.isFunction(callback)) {
            callback = cfg;
            cfg = {};
        } else {
            cfg = cfg || {};
        }

        return this.af.zclFunctional(srcEp, dstEp, cId, cmd, zclData, cfg).then(function (msg) {
            self._updateFinalizer(dstEp, cId);
            return msg.payload;
        }).nodeify(callback);
    }

    _updateFinalizer(ep, cId, attrs, reported) {
        var self = this,
            cIdString = zclId.cluster(cId),
            clusters = ep.getClusters().dumpSync();

        cIdString = cIdString ? cIdString.key : cId;

        Q.fcall(function () {
            if (attrs) {
                var newAttrs = {};

                _.forEach(attrs, function (rec) {  // { attrId, status, dataType, attrData }
                    var attrIdString = zclId.attr(cId, rec.attrId);
                    attrIdString = attrIdString ? attrIdString.key : rec.attrId;

                    if (reported)
                        newAttrs[attrIdString] = rec.attrData;
                    else
                        newAttrs[attrIdString] = (rec.status === 0) ? rec.attrData : null;
                });

                return newAttrs;
            } else {
                return self.af.zclClusterAttrsReq(ep, cId);
            }
        }).then(function (newAttrs) {
            var oldAttrs = clusters[cIdString].attrs,
                diff = zutils.objectDiff(oldAttrs, newAttrs);

            if (!_.isEmpty(diff)) {
                _.forEach(diff, function (val, attrId) {
                    ep.getClusters().set(cIdString, 'attrs', attrId, val);
                });

                self.emit('ind:changed', ep, { cid: cIdString, data: diff });
            }
        }).fail(function () {
            return;
        }).done();
    }

};