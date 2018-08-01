const Q = require('q');
const EventEmitter = require('events');
const _ = require('busyman');
const Ziee = require('ziee');
const ZSC = require('zstack-constants');
const debug = {
    bridge: require('debug')('zigbee-bridge'),
    init: require('debug')('zigbee-bridge:init'),
    request: require('debug')('zigbee-bridge:request'),
};

const Device = require('../model/device');
const Endpoint = require('../model/endpoint');

const handlers = {
    attachEventHandlers(bridge) {
        const controller = bridge.controller;
        const hdls = {};

        _.forEach(handlers, (hdl, key) => {
            if (key !== 'attachEventHandlers') {
                hdls[key] = hdl.bind(bridge);
            }
        });

        controller.removeListener('SYS:resetInd', hdls.resetInd);
        controller.removeListener('ZDO:devIncoming', hdls.devIncoming);
        controller.removeListener('ZDO:tcDeviceInd', hdls.tcDeviceInd);
        controller.removeListener('ZDO:stateChangeInd', hdls.stateChangeInd);
        controller.removeListener('ZDO:matchDescRspSent', hdls.matchDescRspSent);
        controller.removeListener('ZDO:statusErrorRsp', hdls.statusErrorRsp);
        controller.removeListener('ZDO:srcRtgInd', hdls.srcRtgInd);
        controller.removeListener('ZDO:beacon_notify_ind', hdls.beacon_notify_ind);
        controller.removeListener('ZDO:leaveInd', hdls.leaveInd);
        controller.removeListener('ZDO:msgCbIncoming', hdls.msgCbIncoming);
        controller.removeListener('ZDO:serverDiscRsp', hdls.serverDiscRsp);
        // controller.removeListener('ZDO:permitJoinInd',     hdls.permitJoinInd);

        controller.on('SYS:resetInd', hdls.resetInd);
        controller.on('ZDO:devIncoming', hdls.devIncoming);
        controller.on('ZDO:tcDeviceInd', hdls.tcDeviceInd);
        controller.on('ZDO:stateChangeInd', hdls.stateChangeInd);
        controller.on('ZDO:matchDescRspSent', hdls.matchDescRspSent);
        controller.on('ZDO:statusErrorRsp', hdls.statusErrorRsp);
        controller.on('ZDO:srcRtgInd', hdls.srcRtgInd);
        controller.on('ZDO:beacon_notify_ind', hdls.beacon_notify_ind);
        controller.on('ZDO:leaveInd', hdls.leaveInd);
        controller.on('ZDO:msgCbIncoming', hdls.msgCbIncoming);
        controller.on('ZDO:serverDiscRsp', hdls.serverDiscRsp);
        // controller.on('ZDO:permitJoinInd',     hdls.permitJoinInd);
    },

    /*
        Event Handlers
    */
    resetInd(msg) {
        if (this.controller.isResetting()) return;

        if (msg !== '_reset') {
            debug.bridge('Starting a software reset...');
        }

        this.stop()
            .then(() => this.start())
            .then(() => {
                if (msg === '_reset') {
                    return this.controller.emit('_reset');
                }
            })
            .fail((err) => {
                if (msg === '_reset') {
                    return this.controller.emit('_reset', err);
                } else {
                    debug.bridge('Reset had an error', err);
                    this.emit('error', err);
                }
            })
            .done();
    },

    devIncoming(devInfo, resolve) {
        // devInfo: { type, ieeeAddr, nwkAddr, manufId, epList, endpoints: [ simpleDesc, ... ] }
        const self = this;
        let dev = this._findDevByAddr(devInfo.ieeeAddr);
        const clustersReqs = [];

        function syncEndpoints(dev) {
            devInfo.endpoints.forEach(function(simpleDesc) {
                let ep = dev.getEndpoint(simpleDesc.epId);

                if (ep) {
                    ep.update(simpleDesc);
                } else {
                    ep = new Endpoint(dev, simpleDesc);
                    ep.clusters = new Ziee();
                    self._attachZclMethods(ep);
                    dev.endpoints[ep.getEpId()] = ep;
                }
            });
        }

        let processDev = Q.fcall(() => {
            if (dev) {
                dev.update(devInfo);
                dev.update({
                    status: 'online',
                    joinTime: Math.floor(Date.now()/1000),
                });
                syncEndpoints(dev);
                return dev;
            } else {
                dev = new Device(devInfo);
                dev.update({
                    status: 'online',
                });
                syncEndpoints(dev);

                return this._registerDev(dev)
                    .then(() => dev);
            }
        }).then((dev) => {
            if (!dev || !dev.hasOwnProperty('endpoints')) return dev;

            // Try genBasic interview, not certain if it works for all devices
            try {
                const attrMap = {
                    4: 'manufName',
                    5: 'modelId',
                    7: 'powerSource',
                };

                const powerSourceMap = {
                    0: 'Unknown',
                    1: 'Mains (single phase)',
                    2: 'Mains (3 phase)',
                    3: 'Battery',
                    4: 'DC Source',
                    5: 'Emergency mains constantly powered',
                    6: 'Emergency mains and transfer switch',
                };

                // Loop all endpoints to find genBasic cluster, and get basic endpoint if possible
                let basicEpInst;

                for (let i in dev.endpoints) {
                    if (!dev.endpoints.hasOwnProperty) continue;

                    let ep = dev.getEndpoint(i);
                    let clusterList = ep.getClusterList();

                    if (_.isArray(clusterList) && clusterList.indexOf(0) > -1) {
                        // genBasic found
                        basicEpInst = ep;
                        break;
                    }
                }

                if (!basicEpInst || basicEpInst instanceof Error) return dev;

                // Get manufName, modelId and powerSource information
                return self.af.zclFoundation(basicEpInst, basicEpInst, 0, 'read', [{attrId: 4}, {attrId: 5}, {attrId: 7}])
                    .then(function(readStatusRecsRsp) {
                        const data = {};
                        if (readStatusRecsRsp && _.isArray(readStatusRecsRsp.payload)) {
                            readStatusRecsRsp.payload.forEach((item) => {
                                // { attrId, status, dataType, attrData }
                                if (item && item.hasOwnProperty('attrId') && item.hasOwnProperty('attrData')) {
                                    if (item.attrId === 7) {
                                        data[attrMap[item.attrId]] = powerSourceMap[item.attrData];
                                    } else {
                                        data[attrMap[item.attrId]] = item.attrData;
                                    }
                                }
                            });
                        }

                        // Update dev
                        dev.update(data);

                        debug.bridge('Identified Device: { manufacturer: %s, product: %s }', data.manufName, data.modelId);

                        // Save device
                        return Q.ninvoke(self._devbox, 'sync', dev._getId())
                            .then(() => dev);
                    })
                    .catch(() => dev);
            } catch (err) {
                return dev;
            }
        }).then((dev) => {
            const numberOfEndpoints = _.keys(dev.endpoints).length;

            const interviewEvents = new EventEmitter();
            interviewEvents.on('ind:interview', (status) => {
                if (status && status.endpoint) status.endpoint.total = numberOfEndpoints;
                self.emit('ind:interview', dev.ieeeAddr, status);
            });

            _.forEach(dev.endpoints, (ep) => {
                // if (ep.isZclSupported())
                clustersReqs.push(() => {
                    return this.af.zclClustersReq(ep, interviewEvents)
                        .then(function(clusters) {
                            _.forEach(clusters, (cInfo, cid) => {
                                ep.clusters.init(cid, 'dir', {value: cInfo.dir});
                                ep.clusters.init(cid, 'attrs', cInfo.attrs, false);
                            });
                        });
                });
            });

            return clustersReqs.reduce((soFar, fn) => soFar.then(fn), Q(0));
        }).then(() => {
            if (_.isFunction(self.acceptDevIncoming)) {
                const info = {
                    ieeeAddr: dev.getIeeeAddr(),
                    endpoints: [],
                };

                _.forEach(dev.epList, (epId) => {
                    info.endpoints.push(dev.getEndpoint(epId));
                });

                return Q.ninvoke(self, 'acceptDevIncoming', info)
                    .timeout(60000);
            }

            return true;
        }).then((accepted) => {
            if (accepted) {
                Q.ninvoke(self._devbox, 'sync', dev._getId());
                debug.bridge('Device: %s join the network.', dev.getIeeeAddr());

                this.emit('ind:incoming', dev);
                this.emit('ind:status', dev, 'online');
                this.controller.emit('ind:incoming' + ':' + dev.getIeeeAddr());
            } else {
                this.remove(dev.getIeeeAddr(), {reJoin: false})
                    .then(() => {
                        Q.ninvoke(this._devbox, 'remove', dev._getId());
                    });
            }
        }).fail((err) => this.emit('error', err));

        if (typeof resolve === 'function') {
            resolve(processDev);
        }

        processDev.done();
    },

    leaveInd(msg) {
        // { srcaddr, extaddr, request, removechildren, rejoin }
        const dev = this._findDevByAddr(msg.extaddr);

        if (dev) {
            const ieeeAddr = dev.getIeeeAddr();
            const epList = _.cloneDeep(dev.epList);

            if (msg.request) {
                // request
                this._unregisterDev(dev);
            } else {
                // indication
                this._devbox.remove(dev._getId(), function() {});
            }

            debug.bridge('Device: %s leave the network.', ieeeAddr);
            this.emit('ind:leaving', epList, ieeeAddr);
        }
    },

    stateChangeInd(msg) {
        // { state[, nwkaddr] }
        if (!msg.hasOwnProperty('nwkaddr')) return;

        let devStates = msg.state;

        _.forEach(ZSC.ZDO.devStates, (statesCode, states) => {
            if (msg.state === statesCode) devStates = states;
        });

        debug.bridge('Device: %d is now in state: %s', msg.nwkaddr, devStates);
    },

    statusErrorRsp(msg) {
        // { srcaddr, status }
        debug.bridge('Device: %d status error: %d', msg.srcaddr, msg.status);
    },

    tcDeviceInd(msg) {
        // { nwkaddr, extaddr, parentaddr }
    },

    matchDescRspSent(msg) {
        // { nwkaddr, numinclusters, inclusterlist, numoutclusters, outclusterlist }
    },

    srcRtgInd(msg) {
        // { dstaddr, relaycount, relaylist }
    },

    beacon_notify_ind(msg) {
        // { beaconcount, beaconlist }
    },

    msgCbIncoming(msg) {
        // { srcaddr, wasbroadcast, clusterid, securityuse, seqnum, macdstaddr, msgdata }
    },

    serverDiscRsp(msg) {
        // { srcaddr, status, servermask }
    },
};

module.exports = handlers;