const Q = require('q');
const fs = require('fs');
const path = require('path');
const Zive = require('zive');
const Ziee = require('ziee');
const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const mock = require('mock-require');

const Coord = require('../lib/model/coord');
const Device = require('../lib/model/device');

chai.use(sinonChai);

const expect = chai.expect;

const coordinator = new Coord({
    type: 0,
    ieeeAddr: '0x00124b00019c2ee9',
    nwkAddr: 0,
    manufId: 10,
    epList: [1, 2],
});

const dev1 = new Device({
    type: 1,
    ieeeAddr: '0x00137a00000161f2',
    nwkAddr: 100,
    manufId: 10,
    epList: [1],
});

const zApp = new Zive({profId: 0x0104, devId: 6}, new Ziee());

describe('Bridge Top Level of Tests', function() {
    before(function(done) {
        let unlink1 = false;

        let unlink2 = false;

        fs.stat('./test/database/dev.db', function(err, stats) {
            if (err) {
                fs.stat('./test/database', function(err, stats) {
                    if (err) {
                        fs.mkdir('./test/database', function() {
                            unlink1 = true;
                            if (unlink1 && unlink2) {
                                done();
                            }
                        });
                    } else {
                        unlink1 = true;
                        if (unlink1 && unlink2) {
                            done();
                        }
                    }
                });
            } else if (stats.isFile()) {
                fs.unlink(path.resolve('./test/database/dev.db'), function() {
                    unlink1 = true;
                    if (unlink1 && unlink2) {
                        done();
                    }
                });
            }
        });

        fs.stat('./test/database/dev1.db', function(err, stats) {
            if (err) {
                fs.stat('./test/database', function(err, stats) {
                    if (err) {
                        fs.mkdir('./test/database', function() {
                            unlink2 = true;
                            if (unlink1 && unlink2) {
                                done();
                            }
                        });
                    } else {
                        unlink2 = true;
                        if (unlink1 && unlink2) {
                            done();
                        }
                    }
                });
            } else if (stats.isFile()) {
                fs.unlink(path.resolve('./test/database/dev1.db'), function() {
                    unlink2 = true;
                    if (unlink1 && unlink2) {
                        done();
                    }
                });
            }
        });
    });

    describe('Constructor Check', function() {
        let Bridge;
        let bridge;

        before(function() {
            mock('objectbox', function() {});
            Bridge = mock.reRequire('../lib/bridge');
            bridge = new Bridge('/dev/ttyUSB0', {dbPath: __dirname + '/database/dev.db'});
        });

        after(function() {
            mock.stop('objectbox');
        });

        it('should has all correct members after new', function() {
            expect(bridge._startTime).to.be.equal(0);
            expect(bridge._enabled).to.be.false;
            expect(bridge._zApp).to.be.an('array');
            expect(bridge.controller).to.be.an('object');
            expect(bridge.af).to.be.null;
            expect(bridge._dbPath).to.be.equal(__dirname + '/database/dev.db');
            expect(bridge._devbox).to.be.an('object');
        });

        it('should throw if path is not a string', function() {
            expect(function() {
                return new Bridge({}, {});
            }).to.throw(TypeError);
            expect(function() {
                return new Bridge([], {});
            }).to.throw(TypeError);
            expect(function() {
                return new Bridge(1, {});
            }).to.throw(TypeError);
            expect(function() {
                return new Bridge(true, {});
            }).to.throw(TypeError);
            expect(function() {
                return new Bridge(NaN, {});
            }).to.throw(TypeError);

            expect(function() {
                return new Bridge('xxx');
            }).not.to.throw(Error);
        });

        it('should throw if opts is given but not an object', function() {
            expect(function() {
                return new Bridge('xxx', []);
            }).to.throw(TypeError);
            expect(function() {
                return new Bridge('xxx', 1);
            }).to.throw(TypeError);
            expect(function() {
                return new Bridge('xxx', true);
            }).to.throw(TypeError);

            expect(function() {
                return new Bridge('xxx', {});
            }).not.to.throw(Error);
        });
    });

    describe('Signature Check', function() {
        let Bridge;
        let bridge;

        before(function() {
            Bridge = mock.reRequire('../lib/bridge');
            bridge = new Bridge('/dev/ttyUSB0', {dbPath: __dirname + '/database/dev.db'});
            bridge._enabled = true;
        });

        describe('#.reset', function() {
            it('should throw if mode is not a number and not a string', () => {
                return Promise.all([
                    bridge.reset({})
                        .catch((err) => expect(err).to.be.instanceof(TypeError)),
                    bridge.reset(true)
                        .catch((err) => expect(err).to.be.instanceof(TypeError)),
                ]);
            });
        });

        describe('#.permitJoin', function() {
            it('should throw if time is not a number', function() {
                return Promise.all([
                    bridge.permitJoin({})
                        .catch((err) => {
                            expect(err).to.be.instanceof(TypeError);
                        }),
                    bridge.permitJoin(true)
                        .catch((err) => {
                            expect(err).to.be.instanceof(TypeError);
                        }),
                ]);
            });

            it('should throw if type is given but not a number and not a string', function() {
                return Promise.all([
                    bridge.permitJoin({})
                        .catch((err) => {
                            expect(err).to.be.instanceof(TypeError);
                        }),
                    bridge.permitJoin(true)
                        .catch((err) => {
                            expect(err).to.be.instanceof(TypeError);
                        }),
                ]);
            });
        });

        describe('#.mount', function() {
            it('should throw if zApp is not an object', function() {
                expect(function() {
                    bridge.mount(true);
                }).to.throw(TypeError);
                expect(function() {
                    bridge.mount('ceed');
                }).to.throw(TypeError);
            });
        });

        describe('#.list', function() {
            it('should throw if ieeeAddrs is not an array of strings', function() {
                expect(function() {
                    bridge.list({});
                }).to.throw(TypeError);
                expect(function() {
                    bridge.list(true);
                }).to.throw(TypeError);
                expect(function() {
                    bridge.list(['ceed', {}]);
                }).to.throw(TypeError);

                expect(function() {
                    bridge.list('ceed');
                }).not.to.throw(Error);
                expect(function() {
                    bridge.list(['ceed', 'xxx']);
                }).not.to.throw(Error);
            });
        });

        describe('#.find', function() {
            it('should throw if addr is not a number and not a string', function() {
                expect(function() {
                    bridge.find({}, 1);
                }).to.throw(TypeError);
                expect(function() {
                    bridge.find(true, 1);
                }).to.throw(TypeError);
            });

            it('should throw if epId is not a number', function() {
                expect(function() {
                    bridge.find(1, {});
                }).to.throw(TypeError);
                expect(function() {
                    bridge.find(1, true);
                }).to.throw(TypeError);
            });
        });

        describe('#.lqi', function() {
            it('should throw if ieeeAddr is not a string', () => {
                return Promise.all([
                    bridge.lqi({})
                        .catch((e) => expect(e).to.be.instanceof(TypeError)),
                    bridge.lqi(true)
                        .catch((e) => expect(e).to.be.instanceof(TypeError)),
                    bridge.lqi('ceed')
                        .catch((e) => expect(e).to.be.instanceof(Error)),
                ]);
            });
        });

        describe('#.remove', () => {
            it('should throw if ieeeAddr is not a string', () => {
                return Promise.all([
                    bridge.remove({})
                        .catch((e) => expect(e).to.be.instanceof(TypeError)),
                    bridge.remove(true)
                        .catch((e) => expect(e).to.be.instanceof(TypeError)),
                    bridge.remove('ceed')
                        .catch((e) => expect(e).to.be.instanceof(Error)),
                ]);
            });
        });
    });

    describe('Functional Check', function() {
        let bridge;

        before(function() {
            const Bridge = mock.reRequire('../lib/bridge');
            bridge = new Bridge('/dev/ttyUSB0', {dbPath: __dirname + '/database/dev1.db'});
            bridge.controller.request = function(subsys, cmdId, valObj, callback) {
                let deferred = Q.defer();

                process.nextTick(function() {
                    deferred.resolve({status: 0});
                });

                return deferred.promise.nodeify(callback);
            };
        });

        describe('#.permitJoin', function() {
            it('should not throw if bridge is not enabled when permitJoin invoked - bridge is disabled.', function(done) {
                bridge.permitJoin(3)
                    .catch((err) => {
                        if (err.message === 'bridge is not enabled.') {
                            done();
                        }
                    });
            });

            it('should trigger permitJoin counter and event when permitJoin invoked - bridge is enabled.', function(done) {
                bridge._enabled = true;
                bridge.once('permitJoining', function(joinTime) {
                    bridge._enabled = false;
                    if (joinTime === 3) {
                        done();
                    }
                });
                bridge.permitJoin(3);
            });
        });

        describe('#.start', function() {
            this.timeout(6000);

            it('should start ok, _ready and ready should be fired, _enabled,', function(done) {
                let _readyCbCalled = false;


                let readyCbCalled = false;


                let startCbCalled = false;


                let startStub = sinon.stub(bridge, 'start', function(callback) {
                    let deferred = Q.defer();

                    bridge._enabled = true;
                    bridge.controller._coord = coordinator;
                    deferred.resolve();

                    setTimeout(function() {
                        bridge.emit('_ready');
                    }, 50);

                    return deferred.promise.nodeify(callback);
                });

                bridge.once('_ready', function() {
                    _readyCbCalled = true;
                    if (_readyCbCalled && readyCbCalled && startCbCalled && bridge._enabled) {
                        setTimeout(function() {
                            startStub.restore();
                            done();
                        }, 200);
                    }
                });

                bridge.once('ready', function() {
                    readyCbCalled = true;
                    if (_readyCbCalled && readyCbCalled && startCbCalled && bridge._enabled) {
                        setTimeout(function() {
                            startStub.restore();
                            done();
                        }, 200);
                    }
                });

                bridge.start()
                    .then(() => {
                        startCbCalled = true;
                        if (_readyCbCalled && readyCbCalled && startCbCalled && bridge._enabled) {
                            setTimeout(function() {
                                startStub.restore();
                                done();
                            }, 200);
                        }
                    });
            });
        });

        describe('#.info', function() {
            it('should get correct info about the bridge', function() {
                let getNwkInfoStub = sinon.stub(bridge.controller, 'getNetInfo').returns({
                    state: 'Coordinator',
                    channel: 11,
                    panId: '0x7c71',
                    extPanId: '0xdddddddddddddddd',
                    ieeeAddr: '0x00124b0001709887',
                    nwkAddr: 0,
                    joinTimeLeft: 49,
                });


                let shpInfo = bridge.info();

                expect(shpInfo.enabled).to.be.true;
                expect(shpInfo.net).to.be.deep.equal({state: 'Coordinator', channel: 11, panId: '0x7c71', extPanId: '0xdddddddddddddddd', ieeeAddr: '0x00124b0001709887', nwkAddr: 0});
                expect(shpInfo.joinTimeLeft).to.be.equal(49);
                getNwkInfoStub.restore();
            });
        });

        describe('#.mount', function() {
            it('should mount zApp', function(done) {
                let coordStub = sinon.stub(bridge.controller.querie, 'coordInfo', function(callback) {
                    return Q({}).nodeify(callback);
                });


                let syncStub = sinon.stub(bridge._devbox, 'sync', function(id, callback) {
                    return Q({}).nodeify(callback);
                });

                bridge.mount(zApp, function(err, epId) {
                    if (!err) {
                        coordStub.restore();
                        syncStub.restore();
                        done();
                    }
                });
            });
        });

        describe('#.list', function() {
            this.timeout(5000);

            it('should list one devices', function(done) {
                bridge._registerDev(dev1).then(function() {
                    let devList = bridge.list();
                    expect(devList.length).to.be.equal(1);
                    expect(devList[0].type).to.be.equal(1);
                    expect(devList[0].ieeeAddr).to.be.equal('0x00137a00000161f2');
                    expect(devList[0].nwkAddr).to.be.equal(100);
                    expect(devList[0].manufId).to.be.equal(10);
                    expect(devList[0].epList).to.be.deep.equal([1]);
                    expect(devList[0].status).to.be.equal('offline');
                    done();
                }).fail(function(err) {
                    throw err;
                }).done();
            });
        });

        describe('#.find', function() {
            it('should find nothing', function() {
                expect(bridge.find('nothing', 1)).to.be.undefined;
            });
        });

        describe('#.lqi', () => {
            it('should get lqi of the device', (done) => {
                let requestStub = sinon.stub(bridge.controller, 'request', (subsys, cmdId, valObj, callback) => {
                    let deferred = Q.defer();

                    process.nextTick(() => {
                        deferred.resolve({
                            srcaddr: 100,
                            status: 0,
                            neighbortableentries: 1,
                            startindex: 0,
                            neighborlqilistcount: 1,
                            neighborlqilist: [
                                {
                                    extPandId: '0xdddddddddddddddd',
                                    extAddr: '0x0123456789abcdef',
                                    nwkAddr: 200,
                                    deviceType: 1,
                                    rxOnWhenIdle: 0,
                                    relationship: 0,
                                    permitJoin: 0,
                                    depth: 1,
                                    lqi: 123,
                                },
                            ],
                        });
                    });

                    return deferred.promise.nodeify(callback);
                });

                bridge.lqi('0x00137a00000161f2')
                    .then((data) =>{
                        expect(data[0].ieeeAddr).to.be.equal('0x0123456789abcdef');
                        expect(data[0].lqi).to.be.equal(123);
                        requestStub.restore();
                        done();
                    });
            });
        });

        describe('#.remove', () => {
            it('should remove the device', (done) => {
                let requestStub = sinon.stub(bridge.controller, 'request', (subsys, cmdId, valObj, callback) => {
                    let deferred = Q.defer();

                    process.nextTick(() => {
                        deferred.resolve({srcaddr: 100, status: 0});
                    });

                    return deferred.promise.nodeify(callback);
                });

                bridge.remove('0x00137a00000161f2')
                    .then(() =>{
                        requestStub.restore();
                        done();
                    });
            });
        });

        describe('#.acceptDevIncoming', function() {
            this.timeout(60000);

            it('should fire incoming message and get a new device', function(done) {
                let acceptDevIncomingStub = sinon.stub(bridge, 'acceptDevIncoming', (devInfo, cb) => {
                    setTimeout(() => cb(null, true), 200);
                });

                bridge.once('ind:incoming', function(dev) {
                    acceptDevIncomingStub.restore();
                    if (dev.getIeeeAddr() === '0x00124b000bb55881') {
                        done();
                    }
                });

                bridge.controller.emit('ZDO:devIncoming', {
                    type: 1,
                    ieeeAddr: '0x00124b000bb55881',
                    nwkAddr: 100,
                    manufId: 10,
                    epList: [],
                    endpoints: [],
                });
            });
        });

        describe('#.reset', function() {
            this.timeout(20000);
            it('should reset - soft', function(done) {
                let stopStub = sinon.stub(bridge, 'stop', function(callback) {
                    let deferred = Q.defer();
                    deferred.resolve();
                    return deferred.promise.nodeify(callback);
                });


                let startStub = sinon.stub(bridge, 'start', function(callback) {
                    let deferred = Q.defer();
                    deferred.resolve();
                    return deferred.promise.nodeify(callback);
                });

                bridge.controller.once('SYS:resetInd', function() {
                    setTimeout(function() {
                        stopStub.restore();
                        startStub.restore();
                        done();
                    }, 100);
                });

                bridge.reset('soft');
            });

            it('should reset - hard', function(done) {
                let stopStub = sinon.stub(bridge, 'stop', function(callback) {
                    let deferred = Q.defer();
                    deferred.resolve();
                    return deferred.promise.nodeify(callback);
                });


                let startStub = sinon.stub(bridge, 'start', function(callback) {
                    let deferred = Q.defer();
                    deferred.resolve();
                    return deferred.promise.nodeify(callback);
                });

                bridge.controller.once('SYS:resetInd', function() {
                    setTimeout(function() {
                        stopStub.restore();
                        startStub.restore();
                        done();
                    }, 100);
                });

                bridge.reset('hard');
            });
        });

        describe('#.stop', function() {
            it('should stop ok, permitJoin 0 should be fired, _enabled should be false', (done) => {
                let joinFired = false;
                let stopCalled = false;

                let closeStub = sinon.stub(bridge.controller, 'close', () => {
                    return Promise.resolve();
                });

                bridge.once('permitJoining', (joinTime) => {
                    joinFired = true;
                    if (joinTime === 0 && !bridge._enabled && stopCalled && joinFired) {
                        closeStub.restore();
                        done();
                    }
                });

                bridge.stop()
                    .then(() => {
                        stopCalled = true;
                        if (!bridge._enabled && stopCalled && joinFired) {
                            closeStub.restore();
                            done();
                        }
                    });
            });
        });
    });
});