# node-red odoo

## Don't forget

node-red-contrib-odoo-xmlrpc-2021

## Why this package

- The original package is not maintained anymore.
- This package treats limit and offset as parameters to the Odoo API, rather than merely restricting the number of records returned on the frontend.
- This package documents the usage of each node more comprehensively.

## Example

### search read

msg.filters = [["|",["phone","ilike", msg.payload],["mobile","=", msg.payload]]];  
msg.filters = [[["bom_id","=", msg.bom_id]]];  
msg.filters = [[["id","=", 23]]];

msg.offset = 0;  
msg.limit = 0;

msg.fields = (['name', 'fiscalcode']); 
msg.context = {"lang": "fr_FR", "active_test": false};

### update

msg.payload = [[id1，id2，id3]， {"field_name1": "new value1"}]

msg.payload = {"id": 1, "field_name1": "new value1"}