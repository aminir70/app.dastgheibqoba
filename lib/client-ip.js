'use strict';


function _getClientIp(req) {
    const xfwd = req.headers['x-forwarded-for'];
    if (xfwd) return xfwd.split(',')[0].trim();
    return (req.connection?.remoteAddress || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
}

module.exports = { _getClientIp };
