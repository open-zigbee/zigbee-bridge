const _ = require('busyman');

module.exports = class Device {
    constructor(devInfo) {
        // devInfo = { type, ieeeAddr, nwkAddr, manufId, manufName, powerSource, modelId, epList }

        this._id = null;

        this.type = devInfo.type;
        this.ieeeAddr = devInfo.ieeeAddr;
        this.nwkAddr = devInfo.nwkAddr;
        this.manufId = devInfo.manufId;
        this.manufName = devInfo.manufName;
        this.powerSource = devInfo.powerSource;
        this.modelId = devInfo.modelId;
        this.epList = devInfo.epList;

        // 'online', 'offline'
        this.status = 'offline';
        this.joinTime = null;
        // key is epId in number, { epId: epInst, epId: epInst, ... }
        this.endpoints = {};
    }

    dump() {
        const dumpOfEps = {};

        _.forEach(this.endpoints, (ep, epId) => {
            dumpOfEps[epId] = ep.dump();
        });

        return {
            id: this._id,
            type: this.type,
            ieeeAddr: this.ieeeAddr,
            nwkAddr: this.nwkAddr,
            manufId: this.manufId,
            manufName: this.manufName,
            powerSource: this.powerSource,
            modelId: this.modelId,
            epList: _.cloneDeep(this.epList),
            status: this.status,
            joinTime: this.joinTime,
            endpoints: dumpOfEps,
        };
    }

    getEndpoint(epId) {
        return this.endpoints[epId];
    }

    getIeeeAddr() {
        return this.ieeeAddr;
    }

    getNwkAddr() {
        return this.nwkAddr;
    }

    getManufId() {
        return this.manufId;
    }

    update(info) {
        const infoKeys = [
            'type',
            'ieeeAddr',
            'nwkAddr',
            'manufId',
            'epList',
            'status',
            'joinTime',
            'manufName',
            'modelId',
            'powerSource',
        ];

        _.forEach(info, (val, key) => {
            if (_.includes(infoKeys, key)) this[key] = val;
        });
    }

    _recoverFromRecord(rec) {
        this._recovered = true;
        this.status = 'offline';
        this._setId(rec.id);

        return this;
    }

    _setId(id) {
        this._id = id;
    }

    _getId() {
        return this._id;
    }
};