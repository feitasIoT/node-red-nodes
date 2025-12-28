module.exports = function (RED) {
    var handle_error = function(err, node, msg, fromOdoo=false) {
        var short_message = err.message.length > node.errorlength ? err.message.substring(err.message.length - node.errorlength) : err.message;
        node.log(err.body);
        node.status({fill: "red", shape: "dot", text: fromOdoo ? "Odoo server error" : short_message});
        node.error(short_message, msg);
    };

    function OdooXMLRPCUpdateNode(config) {
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

                var inParams;
                if (msg.payload){
                  if (!Array.isArray(msg.payload)){
                    return handle_error(new Error('when defined, msg.payload must be an array'), node, msg);
                  }
                  inParams = msg.payload
                } else {
                  inParams = [];
                  inParams.push([]);
                }

                var params = [];
                params.push(inParams);
                //node.log('Creating object for model "' + config.model + '"...');
                odoo_inst.execute_kw(config.model, 'write', params, function (err, value) {
                    if (err) {
                        return handle_error(err, node, msg, true);
                    }
                    msg.payload = value;
                    node.send(msg);
                });
            });
        });
    }
    RED.nodes.registerType("odoo-update", OdooXMLRPCUpdateNode);
};
