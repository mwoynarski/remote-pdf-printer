'use strict';

import pdfPrinter from '../controllers/printPdfController.js';

export default function(app, formMulter) {
    app.post('/pdf', formMulter.none(), pdfPrinter.print);

    app.post('/pdf/preview', formMulter.none(), pdfPrinter.preview);

    app.route('/pdf/:file')
        .get(pdfPrinter.get_pdf);

    app.route('/pdf/preview/:file')
        .get(pdfPrinter.get_preview);
};
