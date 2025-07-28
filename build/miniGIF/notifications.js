const { Notification } = require('electron');

function showNotification(title, body) {
    new Notification({
        title: title,
        body: body
    }).show();
}

module.exports = {
    showNotification
};