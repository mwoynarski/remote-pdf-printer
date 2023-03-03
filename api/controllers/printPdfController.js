/**
 * Created by gnat on 18/07/17.
 * TODO
 *   Catch errors - Filesystem when we can't write
 *                - Unable to talk to chrome
 *                - Receiving URL without protocol
 */
'use strict';

import uniqueFilename from 'unique-filename';
import path from 'path';
import fs from 'fs';
import CDP from 'chrome-remote-interface';
import poppler from 'pdf-poppler';
import pad from 'pad-left';
import {PDFDocument} from "pdf-lib";

import {__dirname} from "../dirname/dirname.js";

import {load, contentToDOM, dumpContentToDisk} from "../content/content.js";

const exports = {};

let headerFooterStyle = `<style type="text/css" media="print">
		/* Do not edit below this line */
		@page
		{
		    margin: 0;
		    padding: 0;
		}

		html {
		    margin: 0;
		    padding: 0;
		    overflow: hidden;
		}

		body {
		    margin: 0;
		    padding: 0;
		    height: 100%;
		    overflow: hidden;
		}

		* {
		    -webkit-print-color-adjust: exact;
		    box-sizing: border-box;
		}

        header {
		    position: relative;
		    top: -0.16in; /* Do not change this */
		    height: 1.5in; /* Must match marginTop minus header padding */
		    font-size: 11pt;
		    width: 100%;
		}

		footer {
            position: relative;
            bottom: -0.16in; /* Do not change this */
            font-size: 10pt;
            width: 100%;
        }
</style>`;

const options = {
    port:          process.env.CHROME_PORT || 1337,
    debug:         process.env.DEBUG || false,
    debug_sources: process.env.DEBUG || process.env.DEBUG_SOURCES || false,
    dir:           process.env.DIR || __dirname + '/../../files/'
};

async function getPdf(html, printOptions) {
    const {
              client,
              target
          }      = await load(html, options);
    const {Page} = client;

    // https://chromedevtools.github.io/debugger-protocol-viewer/tot/Page/#method-printToPDF
    const pdf = await Page.printToPDF(printOptions);
    await CDP.Close({
        port: options.port,
        id:   target.id
    });

    return pdf;
}

function writeFile(fileName, pdfStream) {
    return new Promise(function (resolve, reject) {
        fs.writeFileSync(fileName, Buffer.from(pdfStream.data, 'base64'), (error) => {
            if (error) {
                reject(error);
            }
        });

        if (options.debug) {
            console.log(`wrote file ${fileName} successfully`);
        }

        resolve(fileName);
    });
}

async function returnPreviewResponse(req, res, pdfInfo, pathname) {
    let filename = path.basename(pathname);
    let baseUrl  = req.protocol + '://' + req.get('host') + '/pdf/preview/';

    let response = {
        success: true,
        pages:   pdfInfo.pages,
        images:  []
    };

    for (let x = 1; x <= pdfInfo.pages; x++) {
        response.images.push(baseUrl + filename + '-' + pad(x, pdfInfo.pages.length, '0') + '.jpg')
    }

    return response;
}

function writeFiles(pdfs, outputFile) {
    return new Promise(function (resolve, reject) {
        // More than one document produced..
        let inputFiles = [];

        pdfs.forEach(async function (individualPdf, index) {
            let fileName = outputFile + '-' + index;
            inputFiles.push(fileName);
            await writeFile(fileName, individualPdf);
        });

        if (inputFiles.length === 0) {
            reject(Error('No Input Files'));
        }

        resolve(inputFiles);
    });
}

async function combine(inputFiles, outputFile) {
    await poppler.combine(inputFiles, outputFile);
    return outputFile;
}

async function convert(outputFile) {
    let opts = {
        format:     'jpeg',
        out_dir:    options.dir + '/previews/',
        out_prefix: path.basename(outputFile, '.pdf'),
        page:       null
    };

    await poppler.convert(outputFile, opts);

    return outputFile;
}

function info(outputFile) {
    return poppler.info(outputFile);
}

function isFile(fullpath) {
    try {
        return fs.statSync(fullpath).isFile()
    } catch (e) {
        return false
    }
}

function servePdf(res, filename) {
    const fullpath = `${options.dir}/pdfs/${filename}`;
    if (options.debug) {
        console.log('Requesting Filename: ' + fullpath);
    }

    if (!isFile(fullpath)) {
        res.status(404).send('No such file');
        return;
    }

    res.setHeader('Content-disposition', `attachment; filename=${filename}.pdf`);
    res.setHeader('Content-type', 'application/pdf');
    const stream = fs.createReadStream(fullpath);
    stream.pipe(res);
}

function getPrintOptions(body, res) {
    let printOptions = {
        printBackground: true
    };

    if (options.debug) {
        console.log('Request Keys ' + Object.keys(body));
    }

    if (body) {
        body.headerSettings         = body.headerSettings || {};
        body.footerSettings         = body.footerSettings || {};
        body.headerSettings.enabled = body.headerSettings.enabled === '1';
        body.footerSettings.enabled = body.footerSettings.enabled === '1';
        printOptions.marginTop      = 0;
        printOptions.marginBottom   = 0;

        /** TODO: this code relates to using the Chrome printToPdf header component, rather than our current method of simply inserting a header element at the top of the page.
         * Figure out if this can be made compatible with the footers - currently it looks like you can't have one with out the other?  There's only the single
         * displayHeaderFooter param provided by the Chrome API.
         */
        // if (body.headerSettings.enabled) {
        //     if (!body.headerSettings.height) {
        //         res.status(400).json({
        //             error:   'Unable to generate/save PDF!',
        //             message: 'When providing a header template the height is required'
        //         });
        //     }
        //
        //     if (options.debug) {
        //         console.log('Have Header');
        //     }
        //
        //     printOptions.headerTemplate      = headerFooterStyle + body.header;
        //     printOptions.footerTemplate      = '<footer></footer>';
        //
        //     let requestedMargin = parseFloat(body.headerSettings.height);
        //     let adjustment      = 0.35;
        //     if (requestedMargin - 1 > 0) {
        //         adjustment += 0.35 * (requestedMargin - 1);
        //     }
        //
        //     printOptions.marginTop = requestedMargin + adjustment; //accounts for the odd -0.16in margins
        // } else if (options.debug) {
        //     console.log('No Header');
        // }

        if (body.footerSettings.enabled) {
            if (!body.footerSettings.height) {
                res.status(400).json({
                    error:   'Unable to generate/save PDF!',
                    message: 'When providing a footer template the height is required'
                });
            }

            if (options.debug) {
                console.log('Have Footer');
            }

            printOptions.displayHeaderFooter = true;
            printOptions.footerTemplate      = headerFooterStyle + body.footer;
            if (!printOptions.headerTemplate) {
                printOptions.headerTemplate = '<header></header>';
            }

            let requestedMargin = parseFloat(body.footerSettings.height);
            let adjustment      = 0.35;
            if (requestedMargin - 1 > 0) {
                adjustment += 0.35 * (requestedMargin - 1);
            }

            printOptions.marginBottom = requestedMargin + adjustment;
        } else if (options.debug) {
            console.log('No Footer');
        }

        if (body.marginLeft) {
            printOptions.marginLeft = parseFloat(body.marginLeft);
        }

        if (body.marginRight) {
            printOptions.marginRight = parseFloat(body.marginRight);
        }

        printOptions.headerSettings = body.headerSettings;
        printOptions.footerSettings = body.footerSettings;
        printOptions.headerContent  = body.headerContent || null;

        if (!printOptions.hasOwnProperty('marginTop') && body.marginTop) {
            printOptions.marginTop = parseFloat(body.marginTop);
        }

        if (!printOptions.hasOwnProperty('marginBottom') && body.marginBottom) {
            printOptions.marginBottom = parseFloat(body.marginBottom);
        }

        if (body.hasOwnProperty('paperSize') && body.paperSize) {
            printOptions.paperWidth  = parseFloat(body.paperSize[0]);
            printOptions.paperHeight = parseFloat(body.paperSize[1]);
        }
    }

    if (options.debug) {
        console.log('PrintOptions: ' + Object.keys(printOptions));
    }

    return printOptions;
}

function servePreview(res, filename) {
    const fullpath = `${options.dir}/previews/${filename}`;
    if (options.debug) {
        console.log('Requesting Filename: ' + fullpath);
    }

    if (!isFile(fullpath)) {
        res.status(404).send('No such file');
        return;
    }

    res.setHeader('Content-disposition', `attachment; filename=${filename}`);
    res.setHeader('Content-type', 'image/jpeg');
    const stream = fs.createReadStream(fullpath);
    stream.pipe(res);
}

function getData(req) {
    if (req.body.data !== undefined) {
        return Array.isArray(req.body.data) ? req.body.data : [req.body.data];
    }

    if (req.body.url !== undefined) {
        return Array.isArray(req.body.url) ? req.body.url : [req.body.url];
    }

    return [];
}

exports.print = function (req, res) {
    const randomPrefixedTmpFile = uniqueFilename(options.dir + '/pdfs/');
    let data                    = getData(req);

    if (!data) {
        if (options.debug) {
            console.error('Unable to retrieve data to generate PDF!');
        }

        res.status(400).json({
            error:   'Unable to retrieve data to generate PDF!',
            message: 'No url / data submitted'
        });
        return;
    }

    if (options.debug) {
        console.log('Request Content-Length: ' + (data.length / 1024) + 'kb');
    }

    const toPrint = getDocuments(data, getPrintOptions(req.body, res));
    let documents = [];

    for (const [suffix, files] of Object.entries(toPrint)) {
        if (!files.length) {
            break;
        }

        const filename = randomPrefixedTmpFile + '__' + suffix;

        documents.push(Promise
            .all(files)
            .then((pdfs) => {
                return new Promise(resolve => {
                    writeFile(filename, pdfs[0])
                        .then(() => {
                            resolve(filename);
                        })
                        .catch((error) => {
                            console.log(`Caught Error ${error}`);
                            res.status(400).json({error: 'Unable to generate PDF!'});
                        });

                });
            })
            .catch((error) => {
                console.log(`Caught Error ${error}`);
                res.status(400).json({error: 'Unable to generate PDF!'});
            }));
    }

    Promise.all(documents).then(responses => {
        mergePdfs(responses).then(pathname => {
            if (!req.body.download || req.body.download === '0') {
                const filename = path.basename(pathname) + '.pdf';

                res.status(200);
                res.json({
                    pdf: filename,
                    url: req.protocol + '://' + req.get('host') + '/pdf/' + filename,
                });

                return;
            }

            servePdf(res, path.basename(pathname));
        }).catch(error => {
            console.log(`Caught: ${error}`);
            res.status(400).json({error: 'Unable to generate PDF document!'});
        });
    });
};

function getMergePrintOptions(printOptions) {
    let printOptions2 = JSON.parse(JSON.stringify(printOptions));

    // This second document will be the latter part of the combined file, where we do not want a footer. Remove it.
    printOptions2.footerSettings      = null;
    printOptions2.footerTemplate      = '';
    printOptions2.displayHeaderFooter = false;
    printOptions2.marginBottom        = 0;

    return printOptions2;
}

function updateHeaderDimensionsForFooter(document, printOptions) {
    let headerHeight    = ((parseFloat(printOptions.headerSettings.height || '0.0') * 10000) + (printOptions.marginBottom * 10000)) / 10000; //Add the footer height to the header so the initial page break is in the same place
    const header        = document.querySelector('header');
    headerHeight += 0.4; // There is a 0.4 inch difference in presentation between having a header and footer, and a header with the height of both.  This seems to correspond to an implicit 0.4" margin we've noticed Chrome add to all printed pages, but I don't really have an explanation beyond that.
    header.style.height = headerHeight + 'in';// We fetch the html content with document.body.outerHTML, so we don't need to clone this because it's just a string, not an obj reference
}

function getDocuments(data, printOptions) {
    let toPrint = {
        base:    [],
        toMerge: []
    };
    data.forEach(function (content) {
        const document = contentToDOM(content, printOptions);
        dumpContentToDisk(document.body.outerHTML, options);
        toPrint.base.push(getPdf(document.body.outerHTML, printOptions));

        if (printOptions.footerSettings && printOptions.footerSettings.location === 'first')// Create a second document
        {
            updateHeaderDimensionsForFooter(document, printOptions);
            toPrint.toMerge.push(getPdf(document.body.outerHTML, getMergePrintOptions(printOptions)));
            dumpContentToDisk(document.body.outerHTML, options);
        }
    });

    return toPrint;
}

exports.preview = function (req, res) {
    const randomPrefixedTmpFile = uniqueFilename(options.dir + '/pdfs/');
    const data                  = getData(req);

    if (data && options.debug) {
        console.log('Request Content-Length: ' + (data.length / 1024) + 'kb');
    }

    let toPrint = getDocuments(data, getPrintOptions(req.body, res));

    let documents = [];

    // We can generate previews for multiple documents at the same time
    for (const [suffix, files] of Object.entries(toPrint)) {
        if (!files.length) {
            break;
        }

        const filename = randomPrefixedTmpFile + '__' + suffix;
        documents.push(Promise
            .all(files)
            .then((pdfs) => {
                if (pdfs.length === 1) {
                    return new Promise(resolve => {
                        let pdfInfo;
                        writeFile(filename, pdfs[0])
                            .then((outputFile) => {
                                return info(outputFile).then((info) => {
                                    pdfInfo = info;
                                    return outputFile;
                                });
                            })
                            .then((outputFile) => {
                                return convert(outputFile);
                            })
                            .then((outputFile) => {
                                resolve(returnPreviewResponse(req, res, pdfInfo, outputFile));
                            })
                            .catch((error) => {
                                console.log(`Caught: ${error}`);
                                res.status(400).json({error: 'Unable to generate PDF preview!'});
                            });
                    });
                }

                // else
                return new Promise(resolve => {
                    let pdfInfo;
                    writeFiles(pdfs, filename)
                        .then((inputFiles) => {
                            return combine(inputFiles, filename);
                        })
                        .then((outputFile) => {
                            return info(outputFile).then((info) => {
                                pdfInfo = info;
                                return outputFile;
                            });
                        })
                        .then((outputFile) => {
                            return convert(outputFile);
                        })
                        .then((outputFile) => {
                            resolve(returnPreviewResponse(req, res, pdfInfo, outputFile));
                        })
                        .catch((error) => {
                            console.log(`Caught Error: ${error}`);
                            res.status(400).json({error: 'Unable to generate PDF preview!'});
                        });
                });
            })
            .catch((error) => {
                console.log(`Caught: ${error}`);
                res.status(400).json({error: 'Unable to generate PDF preview!'});
            }));
    }

    Promise.all(documents).then(responses => {
        res.json(mergeResponses(responses));
    });
};

function mergeResponses(responses) {
    let response = responses[0];

    if (responses.length === 2) {
        const baseResponse  = responses[0].images[0].includes('__base') ? responses[0] : responses[1];
        const mergeResponse = baseResponse === responses[0] ? responses[1] : responses[0];

        //Grab the first page of the base response, the remaining pages of the merge response, combine them, and return the result.
        response = {...baseResponse};//clone baseResponse to the main response because we still need the rest of the fields
        mergeResponse.images.shift();
        response.images = [baseResponse.images.shift(), ...mergeResponse.images];
    }

    return response;
}

/**
 * @returns {Promise<PDFDocument>}
 */
async function getPdfFile(file) {
    return new Promise((resolve, reject) => {
        fs.readFile(file, async (err, data) => {
            if (err) {
                return reject(err);
            }
            const document = await PDFDocument.load(data)
            resolve(document);
        });
    }).catch(err => {
        throw err;
    });
}

async function writePdfFile(filename, content) {
    return new Promise(async (resolve, reject) => {
        fs.writeFile(filename, content, err => {
            if (err) {
                return reject(err);
            }

            resolve();
        });
    }).catch(err => {
        throw err;
    });
}

async function mergePdfs(files) {
    return new Promise(async (resolve, reject) => {
        if (files.length === 2) {
            const baseFile   = files[0].includes('__base') ? files[0] : files[1];
            const outputFile = baseFile.replace('__base', '');
            const mergeFile  = baseFile === files[0] ? files[1] : files[0];
            let baseDoc;
            let mergeDoc;

            // we only have the raw file content; produce actual PDF files that we can manipulate
            try {
                baseDoc  = await getPdfFile(baseFile);
                mergeDoc = await getPdfFile(mergeFile);
            } catch (err) {
                return reject(err);
            }

            const outputDoc   = await PDFDocument.create(); // Create the single file we will return
            const [firstPage] = await outputDoc.copyPages(baseDoc, [0]); // grab the first page of the base file
            let indices       = [...Array(mergeDoc.getPages().length).keys()]; // copyPages requires an array of individual page numbers, so create an array that has an index for every page in the document
            indices.shift(); //Remove the first page from the file to be merged
            const remainingPages = await outputDoc.copyPages(mergeDoc, [...indices]); // grab the remaining pages from the second file
            outputDoc.addPage(firstPage);// pdf-lib requires that we manually append the pages for some reason, even though we've already copied them
            remainingPages.forEach(page => outputDoc.addPage(page));

            const outputBytes = await outputDoc.save();

            try {
                await writePdfFile(outputFile, outputBytes);
            } catch (err) {
                return reject(err);
            }

            resolve(outputFile);
        }

        resolve(files[0]);
    }).catch(err => {
        throw err;
    });
}

exports.get_pdf = function (req, res) {
    const {file} = req.params;

    // Ensure no one tries a directory traversal
    if (!file || file.indexOf('..') !== -1 || file.indexOf('.pdf') === -1) {
        res.status(404).send('Invalid filename!');
        return;
    }

    servePdf(res, file.replace('.pdf', ''));
};

exports.get_preview = function (req, res) {
    const {file} = req.params;

    // Ensure no one tries a directory traversal
    if (!file || file.indexOf('..') !== -1 || file.indexOf('.jpg') === -1) {
        res.status(404).send('Invalid filename!');
        return;
    }

    servePreview(res, file);
};

export default exports;
