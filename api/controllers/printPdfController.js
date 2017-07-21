/**
 * Created by gnat on 18/07/17.
 * TODO
 *   Catch errors - Filesystem when we can't write
 *                - Unable to talk to chrome
 *                - Receiving URL without protocol
 */
'use strict';

const uniqueFilename = require('unique-filename');
const htmlPdf = require('html-pdf-chrome');
const path = require('path');
const fs = require('fs');
const options = {
    htmlPDF: {
        port: process.env.CHROME_PORT || 1337,
        printOptions: {
            marginTop: 0,
            marginRight: 0,
            marginLeft:0,
            printBackground: true,
        }
    },
    dir: process.env.DIR || __dirname+'/../../files/'
};

exports.print_url = function(req, res) {
    var randomPrefixedTmpfile = uniqueFilename(options.dir);
    htmlPdf.create(req.query.url, options.htmlPDF).then((pdf) => {
        pdf.toFile(randomPrefixedTmpfile)
        if(!req.query.download || req.query.download == false) {
            res.json({url: req.query.url, pdf: path.basename(randomPrefixedTmpfile)+'.pdf'});
            return;
        }

        res.setHeader('Content-disposition', 'attachment; filename='+path.basename(randomPrefixedTmpfile)+'.pdf');
        res.setHeader('Content-type', 'application/pdf');
        var filestream = fs.createReadStream(randomPrefixedTmpfile);
        filestream.pipe(res);
    }).catch((reason) => {
        res.status(400).json({error: 'Unable to generate PDF'});
        return;
    });
};

exports.print_html = function(req, res) {
    var randomPrefixedTmpfile = uniqueFilename(options.dir);
    htmlPdf.create(req.body.data, options.htmlPDF).then((pdf) => {
        pdf.toFile(randomPrefixedTmpfile)
        if(!req.body.download || req.body.download == false) {
            res.json({length: req.body.data.length, pdf: path.basename(randomPrefixedTmpfile)+'.pdf'});
            return;
        }

        res.setHeader('Content-disposition', 'attachment; filename='+path.basename(randomPrefixedTmpfile)+'.pdf');
        res.setHeader('Content-type', 'application/pdf');
        var filestream = fs.createReadStream(randomPrefixedTmpfile);
        filestream.pipe(res);
    }).catch((error) => {
        res.status(400).json({error: 'Unable to generate PDF'});
        return;
    });
};

exports.get_pdf = function(req,res) {
    // Ensure no one tries a directory traversal
    if(req.query.file.indexOf('..') !== -1 || req.query.file.indexOf('.pdf') == -1) {
        res.status(400).send('Invalid filename!');
        return;
    }

    res.setHeader('Content-disposition', 'attachment; filename='+req.query.file);
    res.setHeader('Content-type', 'application/pdf');
    var filestream = fs.createReadStream(options.dir+'/'+req.query.file.replace('.pdf',''));
    filestream.pipe(res);
};

