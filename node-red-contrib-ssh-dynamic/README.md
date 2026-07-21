# @feitas/node-red-ssh-dynamic

A dynamic SSH client node for Node-RED. **All connection parameters are read from `msg`** — nothing is hardcoded in the node configuration. This makes it easy to connect to different servers at runtime without redeploying.

## Features

- 🔄 **Fully dynamic** — host, port, username, and password all come from `msg` at runtime
- 🔌 **Persistent connections** — interactive SSH shell sessions stay open between messages, preserving shell state (working directory, environment variables)
- 🏊 **Connection pooling** — automatically reuses existing connections based on `host:port:username`
- 🌐 **WebSocket session mode** — each WebSocket client (`msg._client`) gets its own isolated SSH session; ideal for web-based terminal UIs
- 📦 **Zero static config** — only an optional name field in the node editor; everything else flows through messages
- ⚡ **Auto-reconnect** — sending a message to a closed session automatically reopens the connection
- 📤 **Dual output** — `msg.payload` for stdout and `msg.stderr` flag for stderr data

## Installation

### Via Node-RED Palette Manager

1. Open Node-RED
2. Go to **Manage Palette** → **Install**
3. Search for `@feitas/node-red-ssh-dynamic`
4. Click **Install**

### Via npm

```bash
cd ~/.node-red
npm install @feitas/node-red-ssh-dynamic
```

Or from the Node-RED data directory:

```bash
npm install @feitas/node-red-ssh-dynamic
```

Then restart Node-RED.

## Usage

### Node Configuration

Drag the **ssh-dynamic** node from the palette (category: **network**) onto your flow. The only configurable field is an optional **Name**.

> **All SSH parameters come from incoming messages — no static host/port/username/password needed.**

### Input (`msg`) Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `msg.host` | string | **Yes** (first msg per session) | SSH server hostname or IP address |
| `msg.port` | number | No | SSH port (default: `22`) |
| `msg.username` | string | **Yes** (first msg per session) | SSH login username |
| `msg.password` | string | **Yes** (first msg per session) | SSH login password |
| `msg.payload` | string \| buffer | Yes | Data sent to the remote shell stdin (e.g. `"ls -la\n"`) |
| `msg._client` | string | No | WebSocket client ID for session binding (see below) |

### Output (`msg`) Properties

| Property | Type | Description |
|----------|------|-------------|
| `msg.payload` | buffer | Data received from SSH server (stdout) |
| `msg.host` | string | The host this output originated from |
| `msg.stderr` | boolean | Present and `true` when data came from stderr |

## Connection Management

### Host-Based Mode (Default)

When `msg._client` is **not** present, connections are keyed by `host:port:username`:

- **Same credentials** → connection is reused (shell state preserved)
- **Different host/port/username** → old connection closes, new one opens
- **Changed password** → password is updated on the cached connection entry

### WebSocket Session Mode

When `msg._client` is present (automatically set by `websocket-in` nodes), each client gets its own dedicated SSH session:

1. **First message** from a client **must** include `msg.host`, `msg.username`, and `msg.password`
2. **All subsequent messages** from that client only need `msg.payload` — credentials are cached
3. Multiple browser tabs each get their own `msg._client`, connecting to different hosts through a single node instance

If credentials are missing on the first message and only one connection exists in the pool, the node auto-binds the new session to that existing connection.

## Examples

### Example 1: Basic Command via Inject Node

```javascript
// In a Function node before ssh-dynamic
msg.host = "192.168.1.100";
msg.port = 22;
msg.username = "admin";
msg.password = "secret";
msg.payload = "uname -a\n";
return msg;
```

**Flow:** `inject → function → ssh-dynamic → debug`

### Example 2: Interactive Shell Session

Send multiple commands that share state:

```javascript
// First message
msg.host = "192.168.1.100";
msg.username = "admin";
msg.password = "secret";
msg.payload = "cd /var/log\n";
return msg;

// Second message (connection reused, working directory preserved)
// Only payload needed — host/username/password cached
msg.payload = "ls -la\n";
return msg;
```

### Example 3: Web-Based Terminal

```javascript
// Function node between websocket-in and ssh-dynamic
const clientId = msg._client;
const credsKey = "ssh:" + clientId;
let creds = flow.get(credsKey);

if (!creds) {
    // First message — set credentials
    creds = {
        host: msg.host || "192.168.1.100",
        port: msg.port || 22,
        username: msg.username || "admin",
        password: msg.password || "secret"
    };
    flow.set(credsKey, creds);
}

msg.host = creds.host;
msg.port = creds.port;
msg.username = creds.username;
msg.password = creds.password;
// msg.payload and msg._client pass through
return msg;
```

**Flow:** `websocket-in → function → ssh-dynamic → websocket-out`

### Example 4: Connecting to Multiple Hosts

```javascript
// Dynamic routing based on topic
if (msg.topic === "server-a") {
    msg.host = "10.0.0.1";
    msg.username = "admin";
    msg.password = "pass-a";
} else if (msg.topic === "server-b") {
    msg.host = "10.0.0.2";
    msg.username = "root";
    msg.password = "pass-b";
}
msg.payload = "uptime\n";
return msg;
```

Each host gets its own pooled connection.

## License

MIT — see [package.json](package.json) for details.

## Dependencies

- [ssh2](https://github.com/mscdex/ssh2) — SSH2 client library for Node.js

## Author

[@feitas](https://www.npmjs.com/~feitas)
