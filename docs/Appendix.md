# Appendix

## Debug Messages  

Like many node.js modules do, **zigbee-bridge** utilizes [debug](https://www.npmjs.com/package/debug) module to print out messages that may help in debugging. The namespaces include `zigbee-bridge`, `zigbee-bridge:init`, `zigbee-bridge:request`, and `zigbee-bridge:msgHdlr`. The `zigbee-bridge:request` logs requests that bridge sends to ZNP, and `zigbee-bridge:msgHdlr` logs the indications that comes from endpoints.  

If you like to print the debug messages, run your app.js with the DEBUG environment variable:

```sh
$ DEBUG=zigbee-bridge* app.js         # use wildcard to print all zigbee-bridge messages
$ DEBUG=zigbee-bridge:msgHdlr app.js  # if you are only interested in zigbee-bridge:msgHdlr messages
```

Example:

```sh
jack@ubuntu:~/zigbeer/zigbee-bridge$ DEBUG=zigbee-bridge* node server.js

zigbee-bridge:init zigbee-bridge booting... +0ms
...
zigbee-bridge:init Start the ZNP as a coordinator... +1ms
zigbee-bridge:request REQ --> ZDO:startupFromApp +0ms
zigbee-bridge:msgHdlr IND <-- ZDO:stateChangeInd +839ms
zigbee-bridge:init Now the ZNP is a coordinator. +1ms
zigbee-bridge:request REQ --> SAPI:getDeviceInfo +2ms
zigbee-bridge:request RSP <-- SAPI:getDeviceInfo +25ms
...
zigbee-bridge:request REQ --> ZDO:nodeDescReq +0ms
zigbee-bridge:msgHdlr IND <-- ZDO:nodeDescRsp +28ms
zigbee-bridge:request REQ --> ZDO:activeEpReq +1ms
zigbee-bridge:msgHdlr IND <-- ZDO:activeEpRsp +19ms
zigbee-bridge:request REQ --> ZDO:mgmtPermitJoinReq +1ms
zigbee-bridge:msgHdlr IND <-- ZDO:permitJoinInd +23ms
zigbee-bridge:msgHdlr IND <-- ZDO:mgmtPermitJoinRsp +0ms
zigbee-bridge:init Loading devices from database done. +59ms
zigbee-bridge:init zigbee-bridge is up and ready. +1ms
...
zigbee-bridge:request REQ --> AF:dataRequest, transId: 1 +12ms
zigbee-bridge:request RSP <-- AF:dataRequest, status: 0 +20ms
zigbee-bridge:msgHdlr IND <-- AF:dataConfirm, transId: 1 +24ms
zigbee-bridge:msgHdlr IND <-- AF:incomingMsg, transId: 0 +40ms
```