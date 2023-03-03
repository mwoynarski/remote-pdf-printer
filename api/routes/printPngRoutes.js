'use strict';

import pngPrinter from '../controllers/printPngController.js';
export default function(app, formMulter) {
    // todoList Routes
    app.post('/png', formMulter.none(), pngPrinter.print);

    app.route('/png/:file')
        .get(pngPrinter.get_png);
};
