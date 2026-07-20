# @feitas/node-red-redis

## 支持的命令（我常用的命令）
### SADD

### ZADD

# node-red-contrib-redis

无法忍受的难用。
## SADD
- Topic/key    msg.topic   "test"
- Params    msg.payload   [1, 2]

## ZADD

ZADD myzset 2 "two" 3 "three"

msg.topic = "myzset";
msg.payload = [2, "two", 3, "three"];

ZADD myzset NX 5 "five"

msg.topic = "myzset";
msg.payload = ["NX", 5, "five", 3, "three"];