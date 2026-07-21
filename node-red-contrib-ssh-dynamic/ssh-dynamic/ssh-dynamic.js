'use strict';

const ssh2 = require('ssh2');

module.exports = function (RED) {

  function SshDynamic(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // ---- connection pool ----
    // key: "host:port:username" → { conn, stream, queue, host, port, username, password }
    const connections = new Map();

    // ---- helpers ----

    function connKey(host, port, username) {
      return `${host}:${port}:${username}`;
    }

    /** Find an existing connection entry matching msg.
     *  Returns { entry, key } or null. */
    function findConnection(msg) {
      const host = msg.host;
      const port = Number(msg.port) || 22;
      const username = msg.username;

      if (username) {
        // Exact match
        const key = connKey(host, port, username);
        const entry = connections.get(key);
        if (entry) return { entry, key };
        // Not found — will create new below
        return null;
      }

      // No username provided — search by host (+ port if given)
      const matches = [];
      for (const [key, entry] of connections) {
        if (entry.host === host) {
          if (msg.port && entry.port !== port) continue;
          matches.push({ entry, key });
        }
      }

      if (matches.length === 1) return matches[0];
      if (matches.length > 1) {
        node.error(
          `Multiple connections to ${host} with different usernames. Specify msg.username to disambiguate.`,
          {}
        );
      }
      return null;
    }

    /** Extract websocket session id from msg (supports both _client and _session.id) */
    function getSessionId(msg) {
      if (msg._client) return msg._client;
      if (msg._session && msg._session.id) return msg._session.id;
      return null;
    }

    /** Resolve SSH config + routing key from msg and connection pool.
     *  Returns { sshConfig, connKey } or null on error.
     *
     *  Priority: websocket session id > host-based routing. */
    function resolve(msg) {

      // ---- websocket session mode (msg._client or msg._session.id) ----
      const sessionId = getSessionId(msg);
      if (sessionId) {
        const entry = connections.get(sessionId);

        if (entry) {
          // Existing session — reuse, no credentials needed
          return {
            sshConfig: {
              host: entry.host,
              port: entry.port,
              username: entry.username,
              password: entry.password,
              keepaliveInterval: 5000
            },
            connKey: sessionId
          };
        }

        // No existing session — need full credentials on first message
        if (msg.host && msg.username && msg.password !== undefined) {
          const port = Number(msg.port) || 22;
          return {
            sshConfig: { host: msg.host, port, username: msg.username, password: msg.password, keepaliveInterval: 5000 },
            connKey: sessionId
          };
        }

        // No credentials — try auto-bind to sole existing connection
        const allEntries = Array.from(connections.entries());
        if (allEntries.length === 1) {
          const [oldKey, entry] = allEntries[0];
          connections.delete(oldKey);
          connections.set(sessionId, entry);
          node.log(`Auto-bound session ${sessionId} → ${entry.host}:${entry.port}`);
          return {
            sshConfig: {
              host: entry.host,
              port: entry.port,
              username: entry.username,
              password: entry.password,
              keepaliveInterval: 5000
            },
            connKey: sessionId
          };
        }

        node.error(
          `New session ${sessionId} but no credentials. ` +
          `Send msg.host/msg.username/msg.password on the first message.`, {}
        );
        return null;
      }

      // ---- host-based mode: fallback ----
      const host = msg.host;
      if (!host) {
        node.error('Missing required parameter: msg.host', {});
        return null;
      }

      const existing = findConnection(msg);

      if (existing) {
        const e = existing.entry;
        const password = msg.password !== undefined ? msg.password : e.password;
        return {
          sshConfig: {
            host: e.host,
            port: e.port,
            username: e.username,
            password,
            keepaliveInterval: 5000
          },
          connKey: existing.key
        };
      }

      const port = Number(msg.port) || 22;
      const username = msg.username;
      const password = msg.password;

      if (!username) {
        node.error('Missing required parameter: msg.username (new connection)', {});
        return null;
      }
      if (password === undefined || password === null) {
        node.error('Missing required parameter: msg.password (new connection)', {});
        return null;
      }

      const key = connKey(host, port, username);
      return {
        sshConfig: { host, port, username, password, keepaliveInterval: 5000 },
        connKey: key
      };
    }

    /** Tear down one connection's stream and client.
     *  Keeps the entry in the pool so credentials are cached for reconnect. */
    function closeEntry(entry) {
      if (entry.stream) {
        entry.stream.removeAllListeners();
        entry.stream.end('bye\r\n');
        entry.stream = null;
      }
      if (entry.conn) {
        entry.conn.removeAllListeners();
        entry.conn.end();
        entry.conn = null;
      }
      entry.queue = [];
    }

    /** Create SSH connection + interactive shell for one entry */
    function openConnection(key, sshConfig, initialData, session) {
      // Create or reuse entry
      let entry = connections.get(key);
      if (!entry) {
        entry = {
          conn: null,
          stream: null,
          queue: [],
          host: sshConfig.host,
          port: sshConfig.port,
          username: sshConfig.username,
          password: sshConfig.password,
          _session: session
        };
        connections.set(key, entry);
      } else {
        // Update password in case it changed
        entry.password = sshConfig.password;
        if (session !== undefined) {
          entry._session = session;
        }
      }

      if (initialData !== undefined && initialData !== null) {
        entry.queue.push(initialData);
      }

      const conn = new ssh2.Client();

      conn.on('error', (err) => {
        node.error(`SSH error on ${sshConfig.host}: ${err.message}`, {
          errMsg: err,
          host: sshConfig.host
        });
        node.status({ fill: 'red', shape: 'ring', text: `error: ${sshConfig.host}` });
        closeEntry(entry);
      });

      conn.on('ready', () => {
        node.status({ fill: 'green', shape: 'dot', text: `connected: ${sshConfig.host}` });
        node.log(`SSH connected to ${sshConfig.host}:${sshConfig.port}`);

        conn.shell((err, stream) => {
          if (err) {
            node.error(`Shell open error on ${sshConfig.host}: ${err.message}`, {
              errMsg: err,
              host: sshConfig.host
            });
            conn.end();
            closeEntry(entry);
            return;
          }

          node.debug(`SSH shell opened for ${key}`);
          entry.stream = stream;

          stream.on('close', () => {
            node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
            node.log(`Stream closed for ${sshConfig.host}`);
            closeEntry(entry);
          });

          stream.on('error', (err) => {
            node.error(`Stream error on ${sshConfig.host}: ${err.message}`, {
              errMsg: err,
              host: sshConfig.host
            });
            closeEntry(entry);
          });

          stream.on('data', (data) => {
            node.status({ fill: 'green', shape: 'dot', text: `connected: ${sshConfig.host}` });
            const outMsg = {
              payload: data,
              host: sshConfig.host
            };
            if (entry._session) { outMsg._session = entry._session; }
            node.send(outMsg);
          });

          stream.stderr.on('data', (data) => {
            const outMsg = {
              payload: data,
              host: sshConfig.host,
              stderr: true
            };
            if (entry._session) { outMsg._session = entry._session; }
            node.send(outMsg);
          });

          // flush queued data
          while (entry.queue.length > 0) {
            const chunk = entry.queue.shift();
            stream.write(chunk);
          }
        });
      });

      conn.on('close', () => {
        node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
        node.log(`SSH connection closed for ${sshConfig.host}`);
        closeEntry(entry);
      });

      conn.on('end', () => {
        node.status({ fill: 'red', shape: 'ring', text: 'disconnected' });
        closeEntry(entry);
      });

      conn.connect(sshConfig);
      entry.conn = conn;
    }

    // ---- message handler ----

    node.on('input', (msg) => {
      const resolved = resolve(msg);
      if (!resolved) return;

      const { sshConfig, connKey: key } = resolved;
      const entry = connections.get(key);
      const data = msg.payload;

      if (!entry || !entry.conn) {
        // No active connection for this key — open one
        openConnection(key, sshConfig, data, msg._session);
        return;
      }

      // Keep _session up to date on the entry
      if (msg._session !== undefined) {
        entry._session = msg._session;
      }

      // Connection exists but stream may not be ready yet
      if (!entry.stream) {
        entry.queue.push(data);
        return;
      }

      // Stream is ready — write directly
      try {
        if (entry.stream.writable) {
          entry.stream.write(data);
        } else {
          node.error(`Stream not writable for ${sshConfig.host} — try again`, {});
        }
      } catch (err) {
        node.error(`Error writing to stream: ${err.message}`, { errMsg: err });
      }
    });

    // ---- cleanup ----

    node.on('close', (done) => {
      for (const [key, entry] of connections) {
        closeEntry(entry);
      }
      connections.clear();
      node.status({});
      done();
    });
  }

  RED.nodes.registerType('ssh-dynamic', SshDynamic);
};
