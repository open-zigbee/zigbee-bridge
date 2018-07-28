const EventEmitter = require('events');

const Q = require('q');
const _ = require('busyman');
const znp = require('zigbee-bridge-znp');
const proving = require('proving');
const ZSC = require('zstack-constants');
const debug = {
    bridge: require('debug')('zigbee-bridge'),
    init: require('debug')('zigbee-bridge:init'),
    request: require('debug')('zigbee-bridge:request'),
    response: require('debug')('zigbee-bridge:response')
};

const Ziee = require('ziee');
const Zdo = require('./components/zdo');
const querie = require('./components/querie');
const nvParams = require('./config/nv_start_options');

const Device = require('./model/device');
const Coordpoint = require('./model/coordpoint');
const Coordinator = require('./model/coord');

/*************************************************************************************************/
/*** Private Functions                                                                         ***/
/*************************************************************************************************/
function makeRegParams(loEp) {
    return {
        endpoint: loEp.getEpId(),
        appprofid: loEp.getProfId(),
        appdeviceid: loEp.getDevId(),
        appdevver: 0,
        latencyreq: ZSC.AF.networkLatencyReq.NO_LATENCY_REQS,
        appnuminclusters: loEp.inClusterList.length,
        appinclusterlist: loEp.inClusterList,
        appnumoutclusters: loEp.outClusterList.length,
        appoutclusterlist: loEp.outClusterList
    };
}

module.exports = class Controller extends EventEmitter {

    constructor(bridge, cfg) {
        super();

        let transId = 0;

        if (!_.isPlainObject(cfg))
            throw new TypeError('cfg should be an object.');

        /***************************************************/
        /*** Protected Members                           ***/
        /***************************************************/
        this._bridge = bridge;
        this._coord = null;
        this._znp = znp;
        this._cfg = cfg;
        this._zdo = new Zdo(this);
        this._resetting = false;
        this._spinLock = false;
        this._joinQueue = [];
        this._permitJoinTime = 0;
        this._permitJoinInterval;

        this._net = {
            state: null,
            channel: null,
            panId: null,
            extPanId: null,
            ieeeAddr: null,
            nwkAddr: null,
            joinTimeLeft: 0
        };

        /***************************************************/
        /*** Public Members                              ***/
        /***************************************************/
        this.querie = querie(this);

        // zigbee transection id
        this.nextTransId = () => {
            if (++transId > 255)
                transId = 1;
            return transId;
        };

        /***************************************************/
        /*** Event Handlers                              ***/
        /***************************************************/
        this._znp.on('ready', () => this.setup());

        this._znp.on('close', () => {
            this.emit('ZNP:CLOSE');
        });

        this._znp.on('AREQ', (msg) => {
            event_bridge._areqEventBridge(this, msg);
        });

        this.on('ZDO:endDeviceAnnceInd', (data) => {
            debug.bridge('spinlock:', this._spinLock, this._joinQueue);
            if (this._spinLock) {
                // Check if joinQueue already has this device
                for (var i = 0; i < this._joinQueue.length; i++) {
                    if (this._joinQueue[i].ieeeAddr == data.ieeeaddr) {
                        debug.bridge('already in joinqueue');
                        return;
                    }
                }

                this._joinQueue.push({
                    func: () => {
                        this.endDeviceAnnceHdlr(data);
                    },
                    ieeeAddr: data.ieeeaddr
                });
            } else {
                this._spinLock = true;
                this.endDeviceAnnceHdlr(data);
            }
        });
    }

    /*************************************************************************************************/
    /*** Public ZigBee Utility APIs                                                                ***/
    /*************************************************************************************************/
    getBridge() {
        return this._bridge;
    }

    getCoord() {
        return this._coord;
    }

    getNetInfo() {
        var net = _.cloneDeep(this._net);

        if (net.state === ZSC.ZDO.devStates.ZB_COORD)
            net.state = 'Coordinator';

        net.joinTimeLeft = this._permitJoinTime;

        return net;
    }

    setNetInfo(netInfo) {
        var self = this;

        _.forEach(netInfo, function (val, key) {
            if (_.has(self._net, key))
                self._net[key] = val;
        });
    }

    permitJoinCountdown() {
        return this._permitJoinTime -= 1;
    }

    isResetting() {
        return this._resetting;
    }

    /*************************************************************************************************/
    /*** Mandatory Public APIs                                                                     ***/
    /*************************************************************************************************/
    start(callback) {
        callback || (callback = () => {})

        return Promise.resolve()
            .then(() => new Promise((resolve, reject) => {
                const readyLsn = (err) => {
                    return err
                        ? reject(err)
                        : resolve();
                };

                this.once('ZNP:INIT', readyLsn);

                this._znp.init(this._cfg, (err) => {
                    if (!err) return;

                    this.removeListener('ZNP:INIT', readyLsn);
                    reject(err);
                });
            }))
            .then((result) => callback(undefined, result))
            .catch((e) => callback(e));
    }

    setup() {
        return Promise.resolve()
            .then(() => this.checkNvParams())
            .then(() => this.querie.coordState())
            .then((state) => {
                if (state === 'ZB_COORD' || state === 0x09) return;

                debug.init('Start the ZNP as a coordinator...');
                return this._startupCoord();
            })
            .then(() => {
                debug.init('Now the ZNP is a coordinator.');
                return this.querie.network();
            })
            .then((netInfo) => {
                // netInfo: { state, channel, panId, extPanId, ieeeAddr, nwkAddr }
                this.setNetInfo(netInfo);
                return netInfo;
            })
            .then((netInfo) => this._registerDelegators(netInfo))
            .then(() => {
                this.emit('ZNP:INIT');
            })
            .catch((err) => {
                this.emit('ZNP:INIT', err);
                debug.init('Coordinator initialize had an error:', err);
            });
    }

    _startupCoord() {
        return new Promise((resolve, reject) => {
            const stateChangeHdlr = (data) => {
                if (data.state !== 9) return;

                this.removeListener('ZDO:stateChangeInd', stateChangeHdlr);
                resolve();
            };

            this.on('ZDO:stateChangeInd', stateChangeHdlr);

            this.request('ZDO', 'startupFromApp', {
                startdelay: 100,
            });
        });
    }

    _registerDelegators(netInfo) {
        var coord = this.getCoord(),
            dlgInfos =  [
                { profId: 0x0104, epId: 1 }, { profId: 0x0101, epId: 2 }, { profId: 0x0105, epId: 3 },
                { profId: 0x0107, epId: 4 }, { profId: 0x0108, epId: 5 }, { profId: 0x0109, epId: 6 }
            ];

        return this.simpleDescReq(0, netInfo.ieeeAddr)
            .then((devInfo) => {
                var deregisterEps = [];

                _.forEach(devInfo.epList, (epId) => {
                    if (epId > 10) {
                        deregisterEps.push(() => {
                            return this.request('AF', 'delete', { endpoint: epId }).delay(10).then(function () {
                                debug.init('Deregister endpoint, epId: %s', epId);
                            });
                        });
                    }
                });

                if (!deregisterEps.length) {
                    return devInfo;
                }

                return deregisterEps
                    .reduce(function (soFar, fn) {
                        return soFar.then(fn);
                    }, Q(0))
                    .then(function () {
                        return devInfo;
                    });
            }).then((devInfo) => {
                var registerDlgs = [];

                if (!coord)
                    coord = this._coord = new Coordinator(devInfo);
                else
                    coord.endpoints = {};

                _.forEach(dlgInfos, (dlgInfo) => {
                    var dlgDesc = { profId: dlgInfo.profId, epId: dlgInfo.epId, devId: 0x0005, inClusterList: [], outClusterList: [] },
                        dlgEp = new Coordpoint(coord, dlgDesc, true),
                        simpleDesc;

                    dlgEp.clusters = new Ziee();
                    coord.endpoints[dlgEp.getEpId()] = dlgEp;

                    simpleDesc = _.find(devInfo.endpoints, function (ep) {
                        return ep.epId === dlgInfo.epId;
                    });

                    if (!_.isEqual(dlgDesc, simpleDesc)) {
                        registerDlgs.push(() => {
                            return this.registerEp(dlgEp).delay(10).then(function () {
                                debug.init('Register delegator, epId: %s, profId: %s ', dlgEp.getEpId(), dlgEp.getProfId());
                            });
                        });
                    }
                });

                return registerDlgs.reduce(function (soFar, fn) {
                    return soFar.then(fn);
                }, Q(0));
            }).then(() => {
                return this.querie.coordInfo()
                    .then((coordInfo) => coord.update(coordInfo));
            });
    }

    close(callback) {
        return Promise.resolve()
            .then(() => new Promise((resolve, reject) => {
                const closeLsn = () => resolve();

                this.once('ZNP:CLOSE', closeLsn);

                this._znp.close((err) => {
                    if (!err) return;

                    this.removeListener('ZNP:CLOSE', closeLsn);
                    reject(err);
                })
            }))
            .then((result) => callback(undefined, result))
            .catch((e) => callback(e));
    }

    reset(mode, callback) {
        var self = this,
            deferred = Q.defer(),
            startupOption = nvParams.startupOption.value[0];

        proving.stringOrNumber(mode, 'mode should be a number or a string.');

        Q.fcall(function () {
            if (mode === 'soft' || mode === 1) {
                debug.bridge('Starting a software reset...');
                self._resetting = true;

                return self.request('SYS', 'resetReq', { type: 0x01 });
            } else if (mode === 'hard' || mode === 0) {
                debug.bridge('Starting a hardware reset...');
                self._resetting = true;

                if (self._nvChanged && startupOption !== 0x02)
                    nvParams.startupOption.value[0] = 0x02;

                var steps = [
                    function () { return self.request('SYS', 'resetReq', { type: 0x01 }).delay(0); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.startupOption).delay(10); },
                    function () { return self.request('SYS', 'resetReq', { type: 0x01 }).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.panId).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.extPanId).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.channelList).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.logicalType).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.precfgkey).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.precfgkeysEnable).delay(10); },
                    function () { return self.request('SYS', 'osalNvWrite', nvParams.securityMode).delay(10); },
                    function () { return self.request('SAPI', 'writeConfiguration', nvParams.zdoDirectCb).delay(10); },
                    function () { return self.request('SYS', 'osalNvItemInit', nvParams.znpCfgItem).delay(10).fail(function (err) {
                        return (err.message === 'rsp error: 9') ? null : Q.reject(err);  // Success, item created and initialized
                    }); },
                    function () { return self.request('SYS', 'osalNvWrite', nvParams.znpHasConfigured).delay(10); }
                ];

                return steps.reduce(function (soFar, fn) {
                    return soFar.then(fn);
                }, Q(0));
            } else {
                return Q.reject(new Error('Unknown reset mode.'));
            }
        }).then(function () {
            self._resetting = false;
            if (self._nvChanged) {
                nvParams.startupOption.value[0] = startupOption;
                self._nvChanged = false;
                deferred.resolve();
            } else {
                self.once('_reset', function (err) {
                    return err ? deferred.reject(err) : deferred.resolve();
                });
                self.emit('SYS:resetInd', '_reset');
            }
        }).fail(function (err) {
            deferred.reject(err);
        }).done();

        return deferred.promise.nodeify(callback);
    }

    request(subsys, cmdId, valObj, callback) {
        var deferred = Q.defer(),
            rspHdlr;

        proving.stringOrNumber(subsys, 'subsys should be a number or a string.');
        proving.stringOrNumber(cmdId, 'cmdId should be a number or a string.');

        if (!_.isPlainObject(valObj) && !_.isArray(valObj))
            throw new TypeError('valObj should be an object or an array.');

        if (_.isString(subsys))
            subsys = subsys.toUpperCase();

        rspHdlr = function (err, rsp) {
            if (subsys !== 'ZDO' && subsys !== 5) {
                if (rsp && rsp.hasOwnProperty('status'))
                    debug.request('RSP <-- %s, status: %d', subsys + ':' + cmdId, rsp.status);
                else
                    debug.request('RSP <-- %s', subsys + ':' + cmdId);
            }

            if (err)
                deferred.reject(err);
            else if ((subsys !== 'ZDO' && subsys !== 5) && rsp && rsp.hasOwnProperty('status') && rsp.status !== 0)  // unsuccessful
                deferred.reject(new Error('rsp error: ' + rsp.status));
            else
                deferred.resolve(rsp);
        };

        if ((subsys === 'AF' || subsys === 4) && valObj.hasOwnProperty('transid'))
            debug.request('REQ --> %s, transId: %d', subsys + ':' + cmdId, valObj.transid);
        else
            debug.request('REQ --> %s', subsys + ':' + cmdId);

        if (subsys === 'ZDO' || subsys === 5)
            this._zdo.request(cmdId, valObj, rspHdlr);          // use wrapped zdo as the exported api
        else
            this._znp.request(subsys, cmdId, valObj, rspHdlr);  // SREQ has timeout inside znp

        return deferred.promise.nodeify(callback);
    }

    permitJoin(time, type, callback) {
        // time: seconds, 0x00 disable, 0xFF always enable
        // type: 0 (coord) / 1 (all)
        var self = this,
            addrmode,
            dstaddr;

        proving.number(time, 'time should be a number.');
        proving.stringOrNumber(type, 'type should be a number or a string.');

        return Q.fcall(function () {
            if (type === 0 || type === 'coord') {
                addrmode = 0x02;
                dstaddr = 0x0000;
            } else if (type === 1 || type === 'all') {
                addrmode = 0x0F;
                dstaddr = 0xFFFC;   // all coord and routers
            } else {
                return Q.reject(new Error('Not a valid type.'));
            }
        }).then(function () {
            if (time > 255 || time < 0)
                return Q.reject(new Error('Jointime can only range from  0 to 255.'));
            else
                self._permitJoinTime = Math.floor(time);
        }).then(function () {
            return self.request('ZDO', 'mgmtPermitJoinReq', { addrmode: addrmode, dstaddr: dstaddr , duration: time, tcsignificance: 0 });
        }).then(function (rsp) {
            self.emit('permitJoining', self._permitJoinTime);

            if (time !== 0 && time !== 255) {
                clearInterval(self._permitJoinInterval);
                self._permitJoinInterval = setInterval(function () {
                    if (self.permitJoinCountdown() === 0)
                        clearInterval(self._permitJoinInterval);
                    self.emit('permitJoining', self._permitJoinTime);
                }, 1000);
            }
           return rsp;
        }).nodeify(callback);
    }

    remove(dev, cfg, callback) {
        // cfg: { reJoin, rmChildren }
        var self = this,
            reqArgObj,
            rmChildren_reJoin = 0x00;

        if (!(dev instanceof Device))
            throw new TypeError('dev should be an instance of Device class.');
        else if (!_.isPlainObject(cfg))
            throw new TypeError('cfg should be an object.');

        cfg.reJoin = cfg.hasOwnProperty('reJoin') ? !!cfg.reJoin : true;               // defaults to true
        cfg.rmChildren = cfg.hasOwnProperty('rmChildren') ? !!cfg.rmChildren : false;  // defaults to false

        rmChildren_reJoin = cfg.reJoin ? (rmChildren_reJoin | 0x01) : rmChildren_reJoin;
        rmChildren_reJoin = cfg.rmChildren ? (rmChildren_reJoin | 0x02) : rmChildren_reJoin;

        reqArgObj = {
            dstaddr: dev.getNwkAddr(),
            deviceaddress: dev.getIeeeAddr(),
            removechildren_rejoin: rmChildren_reJoin
        };

        return this.request('ZDO', 'mgmtLeaveReq', reqArgObj).then(function (rsp) {
            if (rsp.status !== 0 && rsp.status !== 'SUCCESS')
                return Q.reject(rsp.status);
        }).nodeify(callback);
    }

    registerEp(loEp, callback) {
        var self = this;

        if (!(loEp instanceof Coordpoint))
            throw new TypeError('loEp should be an instance of Coordpoint class.');

        return this.request('AF', 'register', makeRegParams(loEp)).then(function (rsp) {
            return rsp;
        }).fail(function (err) {
            return (err.message === 'rsp error: 184') ? self.reRegisterEp(loEp) : Q.reject(err);
        }).nodeify(callback);
    }

    deregisterEp(loEp, callback) {
        var self = this,
            coordEps = this.getCoord().endpoints;

        if (!(loEp instanceof Coordpoint))
            throw new TypeError('loEp should be an instance of Coordpoint class.');

        return Q.fcall(function () {
            if (!_.includes(coordEps, loEp))
                return Q.reject(new Error('Endpoint not maintained by Coordinator, cannot be removed.'));
            else
                return self.request('AF', 'delete', { endpoint: loEp.getEpId() });
        }).then(function (rsp) {
            delete coordEps[loEp.getEpId()];
            return rsp;
        }).nodeify(callback);
    }

    reRegisterEp(loEp, callback) {
        var self = this;

        return this.deregisterEp(loEp).then(function () {
            return self.request('AF', 'register', makeRegParams(loEp));
        }).nodeify(callback);
    }

    simpleDescReq(nwkAddr, ieeeAddr, callback) {
        return this.querie.deviceWithEndpoints(nwkAddr, ieeeAddr, callback);
    }

    bind(srcEp, cId, dstEpOrGrpId, callback) {
        return this.querie.setBindingEntry('bind', srcEp, cId, dstEpOrGrpId, callback);
    }

    unbind(srcEp, cId, dstEpOrGrpId, callback) {
        return this.querie.setBindingEntry('unbind', srcEp, cId, dstEpOrGrpId, callback);
    }

    findEndpoint(addr, epId) {
        return this.getBridge().find(addr, epId);
    }

    setNvParams(net) {
        // net: { panId, channelList, precfgkey, precfgkeysEnable, startoptClearState }
        net = net || {};
        proving.object(net, 'opts.net should be an object.');

        _.forEach(net, function (val, param) {
            switch (param) {
                case 'panId':
                    proving.number(val, 'net.panId should be a number.');
                    nvParams.panId.value = [ val & 0xFF, (val >> 8) & 0xFF ];
                    break;
                case 'precfgkey':
                    if (!_.isArray(val) || val.length !== 16)
                        throw new TypeError('net.precfgkey should be an array with 16 uint8 integers.');
                    nvParams.precfgkey.value = val;
                    break;
                case 'precfgkeysEnable':
                    proving.boolean(val, 'net.precfgkeysEnable should be a bool.');
                    nvParams.precfgkeysEnable.value = val ? [ 0x01 ] : [ 0x00 ];
                    break;
                case 'startoptClearState':
                    proving.boolean(val, 'net.startoptClearState should be a bool.');
                    nvParams.startupOption.value = val ? [ 0x02 ] : [ 0x00 ];
                    break;
                case 'channelList':
                    proving.array(val, 'net.channelList should be an array.');
                    var chList = 0;

                    _.forEach(val, function (ch) {
                        if (ch >= 11 && ch <= 26)
                            chList = chList | ZSC.ZDO.channelMask['CH' + ch];
                    });

                    nvParams.channelList.value = [ chList & 0xFF, (chList >> 8) & 0xFF, (chList >> 16) & 0xFF, (chList >> 24) & 0xFF ];
                    break;
                default:
                    throw new TypeError('Unkown argument: ' + param + '.');
            }
        });
    }

    checkNvParams(callback) {
        var self = this,
            steps;

        function bufToArray(buf) {
            var arr = [];

            for (var i = 0; i < buf.length; i += 1) {
                arr.push(buf.readUInt8(i));
            }

            return arr;
        }

        steps = [
            function () { return self.request('SYS', 'osalNvRead', nvParams.znpHasConfigured).delay(10).then(function (rsp) {
                if (!_.isEqual(bufToArray(rsp.value), nvParams.znpHasConfigured.value)) return Q.reject('reset');
            }); },
            function () { return self.request('SAPI', 'readConfiguration', nvParams.panId).delay(10).then(function (rsp) {
                if (!_.isEqual(bufToArray(rsp.value), nvParams.panId.value)) return Q.reject('reset');
            }); },
            function () { return self.request('SAPI', 'readConfiguration', nvParams.channelList).delay(10).then(function (rsp) {
                if (!_.isEqual(bufToArray(rsp.value), nvParams.channelList.value)) return Q.reject('reset');
            }); },
            function () { return self.request('SAPI', 'readConfiguration', nvParams.precfgkey).delay(10).then(function (rsp) {
                if (!_.isEqual(bufToArray(rsp.value), nvParams.precfgkey.value)) return Q.reject('reset');
            }); },
            function () { return self.request('SAPI', 'readConfiguration', nvParams.precfgkeysEnable).delay(10).then(function (rsp) {
                if (!_.isEqual(bufToArray(rsp.value), nvParams.precfgkeysEnable.value)) return Q.reject('reset');
            }); }
        ];

        return steps.reduce(function (soFar, fn) {
            return soFar.then(fn);
        }, Q(0)).fail(function (err) {
            if (err === 'reset' || err.message === 'rsp error: 2') {
                self._nvChanged = true;
                debug.init('Non-Volatile memory is changed.');
                return self.reset('hard');
            } else {
                return Q.reject(err);
            }
        }).nodeify(callback);
    }

    checkOnline(dev, callback) {
        var self = this,
            nwkAddr = dev.getNwkAddr(),
            ieeeAddr = dev.getIeeeAddr();

        this.request('ZDO', 'nodeDescReq', { dstaddr: nwkAddr, nwkaddrofinterest: nwkAddr }).timeout(5000).fail(function () {
            return self.request('ZDO', 'nodeDescReq', { dstaddr: nwkAddr, nwkaddrofinterest: nwkAddr }).timeout(5000);
        }).then(function () {
            if (dev.status === 'offline')
                self.emit('ZDO:endDeviceAnnceInd', { srcaddr: nwkAddr, nwkaddr: nwkAddr, ieeeaddr: ieeeAddr, capabilities: {} });
        }).fail(function () {
            return;
        }).done();
    }

    endDeviceAnnceHdlr(data) {
        var self = this,
            joinTimeout,
            joinEvent = 'ind:incoming' + ':' + data.ieeeaddr,
            dev = this.getBridge()._findDevByAddr(data.ieeeaddr);

        if (dev && dev.status === 'online'){  // Device has already joined, do next item in queue
            debug.bridge('device already in network');

            if (self._joinQueue.length) {
                var next = self._joinQueue.shift();

                if (next) {
                    debug.bridge('next item in joinqueue');
                    setImmediate(function () {
                        next.func();
                    });
                } else {
                    debug.bridge('no next item in joinqueue');
                    self._spinLock = false;
                }
            } else {
                self._spinLock = false;
            }

            return;
        }

        joinTimeout = setTimeout(function () {
            if (self.listenerCount(joinEvent)) {
                self.emit(joinEvent, '__timeout__');
                self.getBridge().emit('joining', { type: 'timeout', ieeeAddr: data.ieeeaddr });
            }

            joinTimeout = null;
        }, 30000);

        this.once(joinEvent, function () {
            if (joinTimeout) {
                clearTimeout(joinTimeout);
                joinTimeout = null;
            }

            if (self._joinQueue.length) {
                var next = self._joinQueue.shift();

                if (next){
                    setImmediate(function () {
                        next.func();
                    });
                } else {
                    self._spinLock = false;
                }
            } else {
                self._spinLock = false;
            }
        });

        this.getBridge().emit('joining', { type: 'associating', ieeeAddr: data.ieeeaddr });

        this.simpleDescReq(data.nwkaddr, data.ieeeaddr).then(function (devInfo) {
            return devInfo;
        }).fail(function () {
            return self.simpleDescReq(data.nwkaddr, data.ieeeaddr);
        }).then(function (devInfo) {
            // Now that we have the simple description of the device clear joinTimeout
            if (joinTimeout) {
                clearTimeout(joinTimeout);
                joinTimeout = null;
            }

            // Defer a promise to wait for the controller to complete the ZDO:devIncoming event!
            var processIncoming = Q.defer();
            self.emit('ZDO:devIncoming', devInfo, processIncoming.resolve, processIncoming.reject);
            return processIncoming.promise;
        }).then(function () {
            self.emit(joinEvent, '__timeout__');
        }).fail(function () {
            self.getBridge().emit('error', 'Cannot get the Node Descriptor of the Device: ' + data.ieeeaddr);
            self.getBridge().emit('joining', { type: 'error', ieeeAddr: data.ieeeaddr });
            self.emit(joinEvent, '__timeout__');
        }).done();
    }

};