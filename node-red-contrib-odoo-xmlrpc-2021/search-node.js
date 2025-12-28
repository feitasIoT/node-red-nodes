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

    function OdooXMLRPCSearchNode(config) {
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
                if (msg.filters){
                  if (!Array.isArray(msg.filters)){
                    return handle_error(new Error('When filters is provided, it must be an array'), node, msg);
                  }
                  inParams = msg.filters;
                } else {
                  inParams = [];
                  inParams.push([]);
                }
                
                var offset = msg.offset;
                if (isDefinedValue(offset)){
                  if (!isUInt(offset)){
                    return handle_error(new Error('When offset is provided, it must be a positive integer number'), node, msg);
                  } else {
                    inParams.push(offset);
                  }
                } else {
                  inParams.push(config.offset); // position parameter, default value
                }
                var limit = msg.limit;
                if (isDefinedValue(limit)){
                  if (!isUInt(limit)){
                    return handle_error(new Error('When limit is provided, it must be a positive integer number'), node, msg);
                  } else {
                    inParams.push(limit);
                  }
                } else {
                  inParams.push(config.limit); // position parameter, default value
                }
                var order = msg.order;
                if (isDefinedValue(order)){
                  if (typeof order !== 'string'){
                    return handle_error(new Error('When order is provided, it must be a string'), node, msg);
                  } else {
                    inParams.push(order);
                  }
                } else {
                  inParams.push(config.order); // position parameter, default value
                }

                var count = msg.count;
                if (isDefinedValue(count)){
                  if (typeof count !== 'boolean'){
                    return handle_error(new Error('When count is provided, it must be a boolean'), node, msg);
                  } else {
                    inParams.push(count);
                  }
                } else {
                  inParams.push(config.count);
                }

                var params = [];
                params.push(inParams); 

                //node.log('Searching for model "' + config.model + '"...');
                // domain, offset=0, limit=None, order=None, count=False
                odoo_inst.execute_kw(config.model, 'search', params, function (err, value) {
                    if (err) {
                      return handle_error(err, node, msg, true);
                    }
                    msg.payload = value;
                    node.send(msg);
                });
            });
        });
    }
    RED.nodes.registerType("odoo-search", OdooXMLRPCSearchNode);
};
