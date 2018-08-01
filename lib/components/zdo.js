const Q = require('q');
const Areq = require('areq');
const ZSC = require('zstack-constants');

const zdoHelper = require('./zdo_helper');

module.exports = class ZDO {
    constructor(controller) {
        this._controller = controller;
        this._areq = new Areq(controller, 10000);
    }

    /*
        Public APIs
    */
    request(apiName, valObj, callback) {
        const requestType = zdoHelper.getRequestType(apiName);

        if (requestType === 'rspless') {
            return this._rsplessRequest(apiName, valObj, callback);
        }

        if (requestType === 'generic') {
            return this._genericRequest(apiName, valObj, callback);
        }

        if (requestType === 'concat') {
            return this._concatRequest(apiName, valObj, callback);
        }

        if (requestType === 'special') {
            return this._specialRequest(apiName, valObj, callback);
        }

        callback(new Error('Unknown request type.'));
    }

    /*
        Protected Methods
    */
    _sendZdoRequestViaZnp(apiName, valObj, callback) {
        const controller = this._controller;
        // bind zdo._sendZdoRequestViaZnp() to znp.zdoRequest()
        const zdoRequest = controller._znp.zdoRequest.bind(controller._znp);

        return zdoRequest(apiName, valObj, (err, rsp) => {
            let error = null;

            if (err) {
                error = err;
            } else if (apiName !== 'startupFromApp' && rsp.status !== 0) {
                error = new Error('request unsuccess: ' + rsp.status);
            }

            callback(error, rsp);
        });
    }

    _rsplessRequest(apiName, valObj, callback) {
        return this._sendZdoRequestViaZnp(apiName, valObj, callback);
    }

    _genericRequest(apiName, valObj, callback) {
        const deferred = Q.defer();
        const areq = this._areq;
        const areqEvtKey = zdoHelper.generateEventOfRequest(apiName, valObj);

        if (areqEvtKey) {
            areq.register(areqEvtKey, deferred, (payload) => {
                areq.resolve(areqEvtKey, payload);
            });
        }

        this._sendZdoRequestViaZnp(apiName, valObj, (err, rsp) => {
            if (err) areq.reject(areqEvtKey, err);
        });

        return deferred.promise.nodeify(callback);
    }

    _specialRequest(apiName, valObj, callback) {
        if (apiName === 'serverDiscReq') {
            // broadcast, remote device may not response when no bits match in mask
            // listener at controller.on('ZDO:serverDiscRsp')
            return this._rsplessRequest('serverDiscReq', valObj, callback);
        }

        if (apiName === 'bindReq') {
            if (valObj.dstaddrmode === ZSC.AF.addressMode.ADDR_16BIT) {
                callback(new Error('TI not support address 16bit mode.'));
            } else {
                return this._genericRequest('bindReq', valObj, callback);
            }
        }

        if (apiName === 'mgmtPermitJoinReq') {
            if (valObj.dstaddr === 0xFFFC) {
                // broadcast to all routers (and coord), no waiting for AREQ rsp
                return this._rsplessRequest('mgmtPermitJoinReq', valObj, callback);
            }

            return this._genericRequest('mgmtPermitJoinReq', valObj, callback);
        }

        callback(new Error('No such request.'));
    }

    _concatRequest(apiName, valObj, callback) {
        if (apiName === 'nwkAddrReq' || apiName === 'ieeeAddrReq') {
            return this._concatAddrRequest(apiName, valObj, callback);
        }

        if (apiName === 'mgmtNwkDiscReq') {
            return this._concatListRequest(apiName, valObj, {
                entries: 'networkcount',
                listcount: 'networklistcount',
                list: 'networklist',
            }, callback);
        }

        if (apiName === 'mgmtLqiReq') {
            return this._concatListRequest(apiName, valObj, {
                entries: 'neighbortableentries',
                listcount: 'neighborlqilistcount',
                list: 'neighborlqilist',
            }, callback);
        }

        if (apiName === 'mgmtRtgReq') {
            return this._concatListRequest(apiName, valObj, {
                entries: 'routingtableentries',
                listcount: 'routingtablelistcount',
                list: 'routingtablelist',
            }, callback);
        }

        if (apiName === 'mgmtBindRsp') {
            return this._concatListRequest(apiName, valObj, {
                entries: 'bindingtableentries',
                listcount: 'bindingtablelistcount',
                list: 'bindingtablelist',
            }, callback);
        }

        callback(new Error('No such request.'));
    }

    _concatAddrRequest(apiName, valObj, callback) {
        let totalToGet = null;
        let accum = 0;
        let nextIndex = valObj.startindex;
        const reqObj = {
            reqtype: valObj.reqtype,
            // start from 0
            startindex: valObj.startindex,
        };
        const finalRsp = {
            status: null,
            ieeeaddr: null,
            nwkaddr: null,
            startindex: valObj.startindex,
            numassocdev: null,
            assocdevlist: [],
        };

        if (apiName === 'nwkAddrReq') {
            reqObj.ieeeaddr = valObj.ieeeaddr;
        } else {
            reqObj.shortaddr = valObj.shortaddr;
        }

        const recursiveRequest = () => {
            this._genericRequest(apiName, reqObj, (err, rsp) => {
                if (err) {
                    callback(err, finalRsp);
                } else if (rsp.status !== 0) {
                    callback(new Error('request unsuccess: ' + rsp.status), finalRsp);
                } else {
                    finalRsp.status = rsp.status;
                    finalRsp.ieeeaddr = finalRsp.ieeeaddr || rsp.ieeeaddr;
                    finalRsp.nwkaddr = finalRsp.nwkaddr || rsp.nwkaddr;
                    finalRsp.numassocdev = finalRsp.numassocdev || rsp.numassocdev;
                    finalRsp.assocdevlist = finalRsp.assocdevlist.concat(rsp.assocdevlist);

                    // compute at 1st rsp back
                    totalToGet = totalToGet || (finalRsp.numassocdev - finalRsp.startindex);
                    accum = accum + rsp.assocdevlist.length;

                    if (valObj.reqtype === 1 && accum < totalToGet) {
                        // extended, include associated devices
                        nextIndex = nextIndex + rsp.assocdevlist.length;
                        reqObj.startindex = nextIndex;
                        recursiveRequest();
                    } else {
                        callback(null, finalRsp);
                    }
                }
            });
        };

        recursiveRequest();
    }

    _concatListRequest(apiName, valObj, listKeys, callback) {
        // valObj = { dstaddr[, scanchannels, scanduration], startindex }
        // listKeys = { entries: 'networkcount', listcount: 'networklistcount', list: 'networklist' };
        let totalToGet = null;
        let accum = 0;
        let nextIndex = valObj.startindex;
        const reqObj = {
            dstaddr: valObj.dstaddr,
            scanchannels: valObj.scanchannels,
            scanduration: valObj.scanduration,
            // starts from 0
            startindex: valObj.startindex,
        };
        const finalRsp = {
            srcaddr: null,
            status: null,
            startindex: valObj.startindex,
        };

        // finalRsp.networkcount = null
        finalRsp[listKeys.entries] = null;
        // finalRsp.networklistcount = null
        finalRsp[listKeys.listcount] = null;
        // finalRsp.networklist = []
        finalRsp[listKeys.list] = [];

        if (apiName === 'mgmtNwkDiscReq') {
            reqObj.scanchannels = valObj.scanchannels;
            reqObj.scanduration = valObj.scanduration;
        }

        const recursiveRequest = () => {
            this._genericRequest(apiName, reqObj, (err, rsp) => {
                if (err) {
                    callback(err, finalRsp);
                } else if (rsp.status !== 0) {
                    callback(new Error('request unsuccess: ' + rsp.status), finalRsp);
                } else {
                    finalRsp.status = rsp.status;
                    finalRsp.srcaddr = finalRsp.srcaddr || rsp.srcaddr;
                    finalRsp[listKeys.entries] = finalRsp[listKeys.entries] || rsp[listKeys.entries];
                    finalRsp[listKeys.listcount] = rsp[listKeys.listcount];
                    finalRsp[listKeys.list] = finalRsp[listKeys.list].concat(rsp[listKeys.list]);

                    totalToGet = totalToGet || (finalRsp[listKeys.entries] - finalRsp.startindex);
                    accum = accum + rsp[listKeys.list].length;

                    if (accum < totalToGet) {
                        nextIndex = nextIndex + rsp[listKeys.list].length;
                        reqObj.startindex = nextIndex;
                        recursiveRequest();
                    } else {
                        callback(null, finalRsp);
                    }
                }
            });
        };

        recursiveRequest();
    }
};