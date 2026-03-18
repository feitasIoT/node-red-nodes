function isDefinedValue(v){
  return !(v == null || typeof v === 'undefined');
}

function isUInt(v){
  return typeof v === 'number' && Math.floor(v) === v && v >= 0;
}

module.exports = function (RED) {
    var handle_error = function(err, node, msg, fromOdoo=false) {
        node.log(err.body);
        // err.message如果超过errorlength个字符，截取最后errorlength个字符
        var short_message = err.message.length > node.errorlength ? err.message.substring(err.message.length - node.errorlength) : err.message;
        node.status({fill: "red", shape: "dot", text: fromOdoo ? "Odoo server error" : short_message});
        node.error(short_message, msg);
    };

    function OdooXMLRPCExecNode(config) {
        RED.nodes.createNode(this, config);
        this.host = RED.nodes.getNode(config.host);
        this.errorlength = this.host.errorlength;
        var node = this;

        node.on('input', function (msg) {
            node.status({});

            this.host.connect(function(err, odoo_inst) {
                if (err) {
                    return handle_error(err, node, msg);
                }

                var method = config.method;
                if (isDefinedValue(msg.method))
                {
                  node.log('method overwritten by msg');
                  method = msg.method;
                }

                var ids = msg.payload;
                if (!isDefinedValue(ids)){
                  return handle_error(new Error('Payload has to be the record identifier(s)'), node, msg);
                }
                if (!Array.isArray(ids)){
                  return handle_error(new Error('Payload has to be an array of record identifiers'), node, msg);
                }

		            var params = [];
                params.push(ids);

                odoo_inst.execute_kw(config.model, method, params, function (err, value) {
                    if (err) {
                        return handle_error(err, node, msg, true);
                    }

                    msg.payload = value;

                    if (value === true) node.status({fill:"green",shape:"dot",text:"'" + method + "' executed"});

                    node.send(msg);
                });
            });
        });
    }
    RED.nodes.registerType("odoo-exec", OdooXMLRPCExecNode);
};
