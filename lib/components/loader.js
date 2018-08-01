const Q = require('q');
const _ = require('busyman');
const Ziee = require('ziee');

const Device = require('../model/device');
const Endpoint = require('../model/endpoint');

function isSameDevice(dev, devRec) {
    return (dev.getIeeeAddr() === devRec.ieeeAddr) ? true : false;
}

const loader = {
    reloadSingleDev(bridge, devRec, callback) {
        const deferred = Q.defer();
        let dev = bridge._devbox.get(devRec.id);

        if (dev && isSameDevice(dev, devRec)) {
            // same dev exists, do not reload
            deferred.resolve(null);
            return deferred.promise.nodeify(callback);
        } else if (dev) {
            // give new id to devRec
            devRec.id = null;
        }

        let recoveredDev = new Device(devRec);

        _.forEach(devRec.endpoints, function(epRec, epId) {
            let recoveredEp = new Endpoint(recoveredDev, epRec);

            recoveredEp.clusters = new Ziee();

            _.forEach(epRec.clusters, function(cInfo, cid) {
                recoveredEp.clusters.init(cid, 'dir', cInfo.dir);
                recoveredEp.clusters.init(cid, 'attrs', cInfo.attrs, false);
            });

            bridge._attachZclMethods(recoveredEp);
            recoveredDev.endpoints[epId] = recoveredEp;
        });

        recoveredDev._recoverFromRecord(devRec);
        // return (err, id)
        return bridge._registerDev(recoveredDev, callback);
    },

    reloadDevs(bridge, callback) {
        let deferred = Q.defer();
        let recoveredIds = [];

        Q.ninvoke(bridge._devbox, 'findFromDb', {})
            .then((devRecs) => {
                let total = devRecs.length;

                devRecs.forEach((devRec) => {
                    // coordinator
                    if (devRec.nwkAddr === 0) {
                        total -= 1;
                        // all done
                        if (total === 0) deferred.resolve(recoveredIds);
                    } else {
                        loader.reloadSingleDev(bridge, devRec)
                            .then((id) => {
                                recoveredIds.push(id);
                            })
                            .fail((err) => {
                                recoveredIds.push(null);
                            })
                            .done(() => {
                                total -= 1;
                                // all done
                                if (total === 0) deferred.resolve(recoveredIds);
                            });
                    }
                });
            })
            .fail((err) => {
                deferred.reject(err);
            })
            .done();

        return deferred.promise.nodeify(callback);
    },

    reload(bridge, callback) {
        const deferred = Q.defer();

        loader.reloadDevs(bridge)
            .then((devIds) => {
                loader.syncDevs(bridge, () => {
                    // whether sync or not, return success
                    deferred.resolve();
                });
            })
            .fail((err) => {
                deferred.reject(err);
            })
            .done();

        return deferred.promise.nodeify(callback);
    },

    syncDevs(bridge, callback) {
        const deferred = Q.defer();
        const idsNotInBox = [];

        Q.ninvoke(bridge._devbox, 'findFromDb', {})
            .then((devRecs) => {
                devRecs.forEach((devRec) => {
                    if (!bridge._devbox.get(devRec.id)) {
                        idsNotInBox.push(devRec.id);
                    }
                });

                if (idsNotInBox.length) {
                    let ops = devRecs.length;
                    idsNotInBox.forEach((id) => {
                        setImmediate(() => {
                            bridge._devbox.remove(id, () => {
                                ops -= 1;
                                if (ops === 0) deferred.resolve();
                            });
                        });
                    });
                } else {
                    deferred.resolve();
                }
            }).fail((err) => {
                deferred.reject(err);
            }).done();

        return deferred.promise.nodeify(callback);
    },
};

module.exports = loader;