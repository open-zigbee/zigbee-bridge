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

/*
    Bridge Class
*/
module.exports = class Bridge extends EventEmitter {
    constructor(path, opts) {
        super();

        // opts: { sp: {}, net: {}, dbPath: 'xxx' }
        const spCfg = {};

        opts = opts || {};

        proving.string(path, 'path should be a string.');
        proving.object(opts, 'opts should be an object if gieven.');

        spCfg.path = path;
        spCfg.options = opts.hasOwnProperty('sp')
            ? opts.sp
            : {baudrate: 115200, rtscts: true};

        /*
            Protected Members
        */
        this._startTime = 0;
        this._enabled = false;
        this._zApp = [];
        this._mounting = false;
        this._mountQueue = [];
        // controller is the main actor
        this.controller = new Controller(this, spCfg);
        this.controller.setNvParams(opts.net);
        this.af = null;

        this._dbPath = opts.dbPath;

        if (!this._dbPath) {
            // use default
            this._dbPath = __dirname + '/database/dev.db';

            // create default db folder if not there
            try {
                fs.statSync(__dirname + '/database');
            } catch (e) {
                fs.mkdirSync(__dirname + '/database');
            }
        }

        this._devbox = new Objectbox(this._dbPath);

        /*
            Event Handlers (Ind Event Bridges)
        */
        eventHandlers.attachEventHandlers(this);

        this.controller.on('permitJoining', (time) => {
            this.emit('permitJoining', time);
        });

        this.on('_ready', () => {
            this._startTime = Math.floor(Date.now()/1000);
            setImmediate(() => this.emit('ready'));
        });

        this.on('ind:incoming', (dev) => {
            const endpoints = [];

            _.forEach(dev.epList, function(epId) {
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
                endpoints: [ep],
                data: notifData,
            });
        });

        this.on('ind:reported', (ep, cId, attrs) => {
            let cIdString = zclId.cluster(cId);
            const notifData = {
                cid: '',
                data: {},
            };

            this._updateFinalizer(ep, cId, attrs, true);

            cIdString = cIdString
                ? cIdString.key
                : cId;

            notifData.cid = cIdString;

            _.forEach(attrs, function(rec) {
                // { attrId, dataType, attrData }
                let attrIdString = zclId.attr(cIdString, rec.attrId);
                attrIdString = attrIdString ? attrIdString.key : rec.attrId;

                notifData.data[attrIdString] = rec.attrData;
            });

            this.emit('ind', {
                type: 'attReport',
                endpoints: [ep],
                data: notifData,
            });
        });

        this.on('ind:status', (dev, status) => {
            const endpoints = [];

            _.forEach(dev.epList, function(epId) {
                endpoints.push(dev.getEndpoint(epId));
            });

            this.emit('ind', {
                type: 'devStatus',
                endpoints: endpoints,
                data: status,
            });
        });
    }

    /*
        Public Methods
    */
    start() {
        return Promise.resolve()
            .then(() => this.controller.start())
            .then(() => {
                this.af = af(this.controller);
            })
            .then(() => this.controller.request('ZDO', 'mgmtPermitJoinReq', {
                addrmode: 0x02,
                dstaddr: 0,
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
                const devs = this._devbox.exportAllObjs();

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
            });
    }

    stop() {
        const devbox = this._devbox;

        return Promise.resolve()
            .then(() => {
                if (!this._enabled) return;

                _.forEach(devbox.exportAllIds(), (id) => {
                    this._devbox.removeElement(id);
                });

                return this.permitJoin(0x00, 'all');
            })
            .then(() => {
                if (!this._enabled) return;
                return this.controller.close();
            })
            .then(() => {
                this._enabled = false;
                this._zApp = null;
                this._zApp = [];
            });
    }

    acceptDevIncoming(devInfo, callback) {
        setImmediate(() => callback(null, true));
    }

    reset(mode) {
        return Promise.resolve()
            .then(() => {
                proving.stringOrNumber(mode, 'mode should be a number or a string.');
            })
            .then(() => {
                if (mode !== 'hard' && mode !== 0) {
                    return;
                }

                if (!this._devbox) {
                    this._devbox = new Objectbox(this._dbPath);
                    return;
                }

                const removeDevs = this._devbox.exportAllIds()
                    .map((id) => new Promise((resolve, reject) => {
                        this._devbox.remove(id, (err) => {
                            if (err) return reject();
                            resolve();
                        });
                    }));

                return Promise.all(removeDevs)
                    .then(() => {
                        if (this._devbox.isEmpty()) {
                            debug.bridge('Database cleared.');
                        } else {
                            debug.bridge('Database not cleared.');
                        }
                    })
                    .catch((err) => debug.bridge(err));
            })
            .then(() => this.controller.reset(mode));
    }

    permitJoin(time, type) {
        type = type || 'all';

        if (!this._enabled) {
            return Promise.reject(new Error('bridge is not enabled.'));
        }

        return this.controller.permitJoin(time, type);
    }

    info() {
        const net = this.controller.getNetInfo();

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
            joinTimeLeft: net.joinTimeLeft,
        };
    }

    mount(zApp, callback) {
        let deferred = (callback && Q.isPromise(callback.promise)) ? callback : Q.defer();
        let coord = this.controller.getCoord();
        let mountId;
        let loEp;

        if (zApp.constructor.name !== 'Zive') {
            throw new TypeError('zApp should be an instance of Zive class.');
        }

        if (this._mounting) {
            this._mountQueue.push(() => {
                this.mount(zApp, deferred);
            });

            return deferred.promise.nodeify(callback);
        }

        this._mounting = true;

        Q.fcall(() => {
            _.forEach(this._zApp, function(app) {
                if (app === zApp) {
                    throw new Error('zApp already exists.');
                }
            });
            this._zApp.push(zApp);
        }).then(() => {
            if (coord) {
                mountId = Math.max.apply(null, coord.epList);
                // epId 1-10 are reserved for delegator
                zApp._simpleDesc.epId = mountId > 10 ? mountId + 1 : 11;
                loEp = new Coordpoint(coord, zApp._simpleDesc);
                loEp.clusters = zApp.clusters;
                coord.endpoints[loEp.getEpId()] = loEp;
                zApp._endpoint = loEp;
            } else {
                throw new Error('Coordinator has not been initialized yet.');
            }
        }).then(() => {
            return this.controller.registerEp(loEp).then(function() {
                debug.bridge('Register zApp, epId: %s, profId: %s ', loEp.getEpId(), loEp.getProfId());
            });
        }).then(() => {
            return this.controller.querie.coordInfo()
                .then((coordInfo) => {
                    coord.update(coordInfo);
                    return Q.ninvoke(this._devbox, 'sync', coord._getId());
                });
        }).then(() => {
            this._attachZclMethods(loEp);
            this._attachZclMethods(zApp);

            loEp.onZclFoundation = function(msg, remoteEp) {
                setImmediate(function() {
                    return zApp.foundationHandler(msg, remoteEp);
                });
            };
            loEp.onZclFunctional = function(msg, remoteEp) {
                setImmediate(function() {
                    return zApp.functionalHandler(msg, remoteEp);
                });
            };

            deferred.resolve(loEp.getEpId());
        }).fail((err) => {
            deferred.reject(err);
        }).done(() => {
            this._mounting = false;
            if (this._mountQueue.length) {
                process.nextTick(() => {
                    this._mountQueue.shift()();
                });
            }
        });

        if (!(callback && Q.isPromise(callback.promise))) {
            return deferred.promise.nodeify(callback);
        }
    }

    list(ieeeAddrs) {
        let foundDevs;

        if (_.isString(ieeeAddrs)) {
            ieeeAddrs = [ieeeAddrs];
        } else if (!_.isUndefined(ieeeAddrs) && !_.isArray(ieeeAddrs)) {
            throw new TypeError('ieeeAddrs should be a string or an array of strings if given.');
        } else if (!ieeeAddrs) {
            ieeeAddrs = _.map(this._devbox.exportAllObjs(), (dev) => {
                // list all
                return dev.getIeeeAddr();
            });
        }

        foundDevs = _.map(ieeeAddrs, (ieeeAddr) => {
            proving.string(ieeeAddr, 'ieeeAddr should be a string.');

            let devInfo;
            const found = this._findDevByAddr(ieeeAddr);

            if (found) {
                devInfo = _.omit(found.dump(), [
                    'id',
                    'endpoints',
                ]);
            }

            // will push undefined to foundDevs array if not found
            return devInfo;
        });

        return foundDevs;
    }

    find(addr, epId) {
        proving.number(epId, 'epId should be a number.');

        const dev = this._findDevByAddr(addr);

        return dev
            ? dev.getEndpoint(epId)
            : undefined;
    }

    lqi(ieeeAddr) {
        return Promise.resolve()
            .then(() => {
                proving.string(ieeeAddr, 'ieeeAddr should be a string.');
            })
            .then(() => this._findDevByAddr(ieeeAddr))
            .then((dev) => {
                if (!dev) {
                    throw new Error('device is not found.');
                }

                return dev;
            })
            .then((dev) => this.controller.request('ZDO', 'mgmtLqiReq', {
                dstaddr: dev.getNwkAddr(),
                startindex: 0,
            }))
            .then((rsp) => {
                // { srcaddr, status, neighbortableentries, startindex, neighborlqilistcount, neighborlqilist }
                if (rsp.status !== 0) return;

                // success
                return rsp.neighborlqilist.map((neighbor) => ({
                    ieeeAddr: neighbor.extAddr,
                    lqi: neighbor.lqi,
                }));
            });
    }

    remove(ieeeAddr, cfg, callback) {
        proving.string(ieeeAddr, 'ieeeAddr should be a string.');

        const dev = this._findDevByAddr(ieeeAddr);

        if (_.isFunction(cfg) && !_.isFunction(callback)) {
            callback = cfg;
            cfg = {};
        } else {
            cfg = cfg || {};
        }

        if (!dev) {
            return Q.reject(new Error('device is not found.'))
                .nodeify(callback);
        }

        return this.controller.remove(dev, cfg, callback);
    }

    /*
        Protected Methods
    */
    _findDevByAddr(addr) {
        // addr: ieeeAddr(String) or nwkAddr(Number)
        proving.stringOrNumber(addr, 'addr should be a number or a string.');

        return this._devbox.find(function(dev) {
            return _.isString(addr)
                ? dev.getIeeeAddr() === addr
                : dev.getNwkAddr() === addr;
        });
    }

    _registerDev(dev, callback) {
        const devbox = this._devbox;
        let oldDev;

        if (!(dev instanceof Device) && !(dev instanceof Coordinator)) {
            throw new TypeError('dev should be an instance of Device class.');
        }

        oldDev = _.isNil(dev._getId()) ? undefined : devbox.get(dev._getId());

        return Q.fcall(() => {
            if (oldDev) {
                throw new Error('dev exists, unregister it first.');
            } else if (dev._recovered) {
                return Q.ninvoke(devbox, 'set', dev._getId(), dev)
                    .then((id) => {
                        dev._recovered = false;
                        delete dev._recovered;
                        return id;
                    });
            } else {
                dev.update({
                    joinTime: Math.floor(Date.now()/1000),
                });

                return Q.ninvoke(devbox, 'add', dev)
                    .then((id) => {
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
        if (ep.constructor.name === 'Zive') {
            const zApp = ep;
            zApp.foundation = (dstAddr, dstEpId, cId, cmd, zclData, cfg, callback) => {
                const dstEp = this.find(dstAddr, dstEpId);

                if (typeof cfg === 'function') {
                    callback = cfg;
                    cfg = {};
                }

                if (!dstEp) {
                    return Q.reject(new Error('dstEp is not found.')).nodeify(callback);
                }

                return this._foundation(zApp._endpoint, dstEp, cId, cmd, zclData, cfg, callback);
            };

            zApp.functional = (dstAddr, dstEpId, cId, cmd, zclData, cfg, callback) => {
                const dstEp = this.find(dstAddr, dstEpId);

                if (typeof cfg === 'function') {
                    callback = cfg;
                    cfg = {};
                }

                if (!dstEp) {
                    return Q.reject(new Error('dstEp is not found.')).nodeify(callback);
                }

                return this._functional(zApp._endpoint, dstEp, cId, cmd, zclData, cfg, callback);
            };
        } else {
            ep.foundation = (cId, cmd, zclData, cfg, callback) => {
                return this._foundation(ep, ep, cId, cmd, zclData, cfg, callback);
            };
            ep.functional = (cId, cmd, zclData, cfg, callback) => {
                return this._functional(ep, ep, cId, cmd, zclData, cfg, callback);
            };
            ep.bind = (cId, dstEpOrGrpId, callback) => {
                return this.controller.bind(ep, cId, dstEpOrGrpId, callback);
            };
            ep.unbind = (cId, dstEpOrGrpId, callback) => {
                return this.controller.unbind(ep, cId, dstEpOrGrpId, callback);
            };
            ep.read = (cId, attrIdOrDef, callback) => {
                const deferred = Q.defer();
                const attr = zutils.parseClusterAttr(cId, attrIdOrDef);

                this._foundation(ep, ep, cId, 'read', [{attrId: attr.id}])
                    .then((readStatusRecsRsp) => {
                        const rec = readStatusRecsRsp[0];
                        if (rec.status === 0) {
                            deferred.resolve(rec.attrData);
                        } else {
                            deferred.reject(new Error('request unsuccess: ' + rec.status));
                        }
                    })
                    .catch((err) => {
                        deferred.reject(err);
                    });

                return deferred.promise.nodeify(callback);
            };
            ep.write = (cId, attrIdOrDef, data, callback) => {
                const deferred = Q.defer();
                const attr = zutils.parseClusterAttr(cId, attrIdOrDef);
                const writeRec = [
                    {
                        attrId: attr.id,
                        dataType: attr.type,
                        attrData: data,
                    },
                ];

                this._foundation(ep, ep, cId, 'write', [writeRec])
                    .then((writeStatusRecsRsp) => {
                        const rec = writeStatusRecsRsp[0];
                        if (rec.status === 0) {
                            deferred.resolve(data);
                        } else {
                            deferred.reject(new Error('request unsuccess: ' + rec.status));
                        }
                    })
                    .catch((err) => {
                        deferred.reject(err);
                    });

                return deferred.promise.nodeify(callback);
            };
            ep.report = (cId, attrIdOrDef, minInt, maxInt, repChange, callback) => {
                const deferred = Q.defer();
                const coord = this.controller.getCoord();
                const dlgEp = coord.getDelegator(ep.getProfId());
                let cfgRpt = true;
                let cfgRptRec;

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
                        direction: 0,
                        attrId: attr.id,
                        dataType: attr.type,
                        minRepIntval: minInt,
                        maxRepIntval: maxInt,
                        repChange: repChange,
                    };
                }

                Q.fcall(() => {
                    if (dlgEp) {
                        return ep.bind(cId, dlgEp)
                            .then(() => {
                                if (!cfgRpt) return;

                                return ep.foundation(cId, 'configReport', [cfgRptRec])
                                    .then((rsp) => {
                                        const status = rsp[0].status;
                                        if (status !== 0) {
                                            deferred.reject(zclId.status(status).key);
                                        }
                                    });
                            });
                    }

                    return Q.reject(new Error('Profile: ' + ep.getProfId() + ' is not supported.'));
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
        if (_.isFunction(cfg) && !_.isFunction(callback)) {
            callback = cfg;
            cfg = {};
        } else {
            cfg = cfg || {};
        }

        return this.af.zclFoundation(srcEp, dstEp, cId, cmd, zclData, cfg)
            .then((msg) => {
                let cmdString = zclId.foundation(cmd);
                cmdString = cmdString
                    ? cmdString.key
                    : cmd;

                if (cmdString === 'read') {
                    this._updateFinalizer(dstEp, cId, msg.payload);
                } else if (cmdString === 'write' || cmdString === 'writeUndiv' || cmdString === 'writeNoRsp') {
                    this._updateFinalizer(dstEp, cId);
                }

                return msg.payload;
            })
            .nodeify(callback);
    }

    _functional(srcEp, dstEp, cId, cmd, zclData, cfg, callback) {
        if (_.isFunction(cfg) && !_.isFunction(callback)) {
            callback = cfg;
            cfg = {};
        } else {
            cfg = cfg || {};
        }

        return this.af.zclFunctional(srcEp, dstEp, cId, cmd, zclData, cfg)
            .then((msg) => {
                this._updateFinalizer(dstEp, cId);
                return msg.payload;
            })
            .nodeify(callback);
    }

    _updateFinalizer(ep, cId, attrs, reported) {
        let cIdString = zclId.cluster(cId);
        const clusters = ep.getClusters().dumpSync();

        cIdString = cIdString ? cIdString.key : cId;

        Q.fcall(() => {
            if (attrs) {
                const newAttrs = {};

                _.forEach(attrs, (rec) => {
                    // { attrId, status, dataType, attrData }
                    let attrIdString = zclId.attr(cId, rec.attrId);
                    attrIdString = attrIdString ? attrIdString.key : rec.attrId;

                    newAttrs[attrIdString] = reported || rec.status === 0
                        ? rec.attrData
                        : null;
                });

                return newAttrs;
            }

            return this.af.zclClusterAttrsReq(ep, cId);
        }).then((newAttrs) => {
            const oldAttrs = clusters[cIdString].attrs;
            const diff = zutils.objectDiff(oldAttrs, newAttrs);

            if (!_.isEmpty(diff)) {
                _.forEach(diff, function(val, attrId) {
                    ep.getClusters().set(cIdString, 'attrs', attrId, val);
                });

                this.emit('ind:changed', ep, {
                    cid: cIdString,
                    data: diff,
                });
            }
        }).fail(() => {}).done();
    }
};