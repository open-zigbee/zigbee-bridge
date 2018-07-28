# zigbee-bridge
An open source ZigBee gateway solution for Node.js

[![Build Status](https://travis-ci.com/open-zigbee/zigbee-bridge.svg?branch=master)](https://travis-ci.com/open-zigbee/zigbee-bridge)
[![npm](https://img.shields.io/npm/v/zigbee-bridge.svg?maxAge=2592000)](https://www.npmjs.com/package/zigbee-bridge)
[![npm](https://img.shields.io/npm/l/zigbee-bridge.svg?maxAge=2592000)](https://www.npmjs.com/package/zigbee-bridge)

## Note

This project is based on the code forked from https://github.com/zigbeer/zigbee-shepherd.

The reason to refactor the project is that the original project has a lot of bugs and flaws, which cannot fulfill the requirement of many projects which are based on it. The official project has not been actively maintained for a long time, so we decided to maintain it by people who are interested in this project and ZigBee technology in general.

Special thanks to [@simenkid](https://github.com/simenkid), [@jackchased](https://github.com/jackchased) and [@hedywings](https://github.com/hedywings) for a great job!

## Overview

**zigbee-bridge** is an open source ZigBee gateway solution with node.js. It uses TI's [CC253X](http://www.ti.com/lsds/ti/wireless_connectivity/zigbee/overview.page) wireless SoC as a [zigbee network processor (ZNP)](http://www.ti.com/lit/an/swra444/swra444.pdf), and takes the ZNP approach with [zigbee-bridge-znp](https://github.com/open-zigbee/zigbee-bridge-znp) to run the CC253X as a coordinator and to run zigbee-bridge as the host.

## [Documentation](./docs/README.md)

* [Introduction](./docs/Introduction.md)
* [API](./docs/API.md)
* [Tutorial](./docs/tutorial/README.md)
* [Appendix](./docs/Appendix.md)

## Installation

> $ npm install zigbee-bridge --save

## Hardware

- [SmartRF05EB (with CC2530EM)](http://www.ti.com/tool/cc2530dk)
- [CC2531 USB Stick](http://www.ti.com/tool/cc2531emk)
- CC2538 (Not tested yet)
- CC2630/CC2650 (Not tested yet)

## Firmware

To use CC2530/31 as the coordinator, please download the [**pre-built ZNP image**](https://github.com/Koenkk/Z-Stack-firmware) to your chip first. The pre-built image has been compiled as a ZNP with ZDO callback, ZCL supports, and functions we need.

## Usage

```js
const Bridge = require('zigbee-bridge');
const bridge = new Bridge('/dev/ttyUSB0');  // create a ZigBee server

bridge.on('ready', () => {
  console.log('Server is ready.');

  // allow devices to join the network within 60 secs
  bridge.permitJoin(60, (err) => {
    if (err) {
      console.log(err);
    }
  });
});

bridge.start((err) => {  // start the server
  if (err) {
    console.log(err);
  }
});
```

## License

Licensed under [MIT](./LICENSE).