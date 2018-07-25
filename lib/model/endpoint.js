const _ = require('busyman');

module.exports = class Endpoint {

    constructor(device, simpleDesc) {
        // simpleDesc = { profId, epId, devId, inClusterList, outClusterList }

        // this is a remote endpoint, always return false
        this.isLocal = () => false;

        this.device = device;                               // bind to device
        this.profId = simpleDesc.profId;
        this.epId = simpleDesc.epId;
        this.devId = simpleDesc.devId;
        this.inClusterList = simpleDesc.inClusterList;      // numbered cluster ids
        this.outClusterList = simpleDesc.outClusterList;    // numbered cluster ids

        this.clusters = null;    // instance of ziee

        // this.clusters.dumpSync()
        // {
        //     genBasic: {
        //         dir: { value: 1 },  // 0: 'unknown', 1: 'in', 2: 'out', 3: 'in' and 'out'
        //         attrs: {
        //             hwVersion: 0,
        //             zclVersion: 1
        //         }
        //     }
        // }

        this.onAfDataConfirm = null;
        this.onAfReflectError = null;
        this.onAfIncomingMsg = null;
        this.onAfIncomingMsgExt = null;
        this.onZclFoundation = null;
        this.onZclFunctional = null;
    }

    /*************************************************************************************************/
    /*** Public Methods                                                                            ***/
    /*************************************************************************************************/
    getSimpleDesc() {
        return {
            profId: this.profId,
            epId: this.epId,
            devId: this.devId,
            inClusterList: _.cloneDeep(this.inClusterList),
            outClusterList: _.cloneDeep(this.outClusterList),
        };
    }

    getIeeeAddr() {
        return this.getDevice().getIeeeAddr();
    }

    getNwkAddr() {
        return this.getDevice().getNwkAddr();
    }

    dump() {
        var dumped = this.getSimpleDesc();

        dumped.clusters = this.clusters.dumpSync();

        return dumped;
    }

    // zcl and binding methods will be attached in bridge
    // endpoint.foundation = function (cId, cmd, zclData[, cfg], callback) {};
    // endpoint.functional = function (cId, cmd, zclData[, cfg], callback) {};
    // endpoint.read = function (cId, attrId, callback) {};
    // endpoint.bind = function (cId, dstEpOrGrpId[, callback]) {};
    // endpoint.unbind = function (cId, dstEpOrGrpId[, callback]) {};

    /*************************************************************************************************/
    /*** Protected Methods                                                                         ***/
    /*************************************************************************************************/
    isZclSupported() {
        var zclSupport = false;

        if (this.profId < 0x8000 && this.devId < 0xc000)
            zclSupport = true;

        this.isZclSupported = function () {
            return zclSupport;
        };

        return zclSupport;
    }

    getDevice() {
        return this.device;
    }

    getProfId() {
        return this.profId;
    }

    getEpId() {
        return this.epId;
    }

    getDevId() {
        return this.devId;
    }

    getInClusterList() {
        return _.cloneDeep(this.inClusterList);
    }

    getOutClusterList() {
        return _.cloneDeep(this.outClusterList);
    }

    getClusterList() {
        var clusterList = this.getInClusterList();

        this.getOutClusterList().forEach(function (cId) {
            if (!_.includes(clusterList, cId))
                clusterList.push(cId);
        });

        return clusterList.sort(function (a, b) { return a - b; });
    }

    getClusters() {
        return this.clusters;
    }

    getManufId() {
        return this.getDevice().getManufId();
    }

    update(simpleDesc) {
        var self = this,
            descKeys = [ 'profId', 'epId', 'devId','inClusterList', 'outClusterList' ];

        _.forEach(simpleDesc, function (val, key) {
            if (_.includes(descKeys, key))
                self[key] = val;
        });
    }

};