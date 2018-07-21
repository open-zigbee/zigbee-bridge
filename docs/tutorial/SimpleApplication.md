# Simple application

In this section, we will use the [GE LINK BULB A19](http://www.gelinkbulbs.com/) and [OSRAM LIGHTIFY CLA60](https://www.osram.com/osram_com/tools-and-services/tools/lightify---smart-connected-light/lightify-for-home---what-is-light-to-you/lightify-products/lightify-classic-a60-tunable-white/index.jsp) to show you how to operate endpoint to simply build up a ZigBee application.

**Target:** Toggle the GE bulb, and you will receive the `'devChange'` type indication of `'ind'` event. Then operate the OSRAM bulb in the opposite status, namely GE _on_, OSRAM _off_ and GE _off_, OSRAM _on_.

* [1] [ZBridge Class - event: 'ready'](../API.md#event-ready)
* [2] [ZBridge Class - event: 'ind'](../API.md#event-ind)
* [3] [Endpoint Class - .functional(cId, cmd, zclData[, cfg], callback)](../API.md#functionalcid-cmd-zcldata-cfg-callback)

```js
const ZBridge = require('zigbee-bridge');
const zserver = new ZBridge('/dev/ttyACM0');

// see [1]
zserver.on('ready', () => {
  console.log('Server is ready. Allow devices to join the network within 180 secs.');
  console.log('Waiting for incoming clients or messages...');
  zserver.permitJoin(180);
});

zserver.on('permitJoining', (joinTimeLeft) => {
  console.log(joinTimeLeft);
});

let geBulb,
    osramBulb,
    geBulbStatus,
    osramBulbStatus;

// see [2]
zserver.on('ind', (msg) => {
  switch (msg.type) {
    case 'devIncoming':
      console.log(`Device: ${msg.data} joining the network!`);

      msg.endpoints.forEach((ep) => {
        console.log(ep.dump());

        if (ep.devId === 544 && ep.clusters.has('genOnOff')) {
          osramBulb = ep;
        } else if (ep.devId === 257 && ep.clusters.has('genOnOff')) {
          geBulb = ep;
        }

        if (osramBulb && geBulb) {
          setInterval(function () {
            // see [3]
            geBulb.functional('genOnOff', 'toggle', {}, (err) => {
              if (!err) {
                console.log('GE BULB TOGGLE!');
              }
            });
          }, 5000);
        }
      });
      break;

    case 'devChange':
      if (msg.endpoints[0].devId === 257) {
        geBulbStatus = msg.data.data.onOff;
        osramBulbStatus = !geBulbStatus ? 'on' : 'off';
        osramBulb.functional('genOnOff', osramBulbStatus, {}, (err) => {
          if (!err) {
            console.log('OSRAM BULB ' + osramBulbStatus.toLowerCase() + '!');
          }
        });
      }
      break;

    default:
      // Not deal with other msg.type in this example
      break;
  }
});

zserver.start((err) => {
  if (err) {
    console.log(err);
  }
});
```