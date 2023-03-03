'use strict';

import jsdom from 'jsdom';
import camelCase from "camelcase";
import CDP from "chrome-remote-interface";
import uniqueFilename from "unique-filename";
import fs from "fs";

const load = async function(html, options) {
    if (options.debug) {
        console.log('Load(html) called');
    }

    let target = undefined;
    try {
        if (options.debug) {
            console.log(`Load using ports ${options.port}`);
        }

        target       = await CDP.New({port: options.port});
        const client = await CDP({target});
        const {
                  Network,
                  Page
              }      = client;
        await Promise.all([Network.enable(), Page.enable()]);
        return new Promise(async (resolve, reject) => {
            function complete(options) {
                if (options.debug) {
                    console.log('Load(html) *actually* resolved');
                }
                resolve(options);
            }

            let resolveOptions       = {
                client: client,
                target: target
            };
            let failed               = false;
            let completed            = false;
            let postResolvedRequests = [];
            const url                = /^(https?|file|data):/i.test(html) ? html : 'data:text/html;base64,' + Buffer.from(html).toString('base64');

            Network.loadingFailed((params) => {
                failed = true;

                if (options.debug) {
                    console.log(`Load(html) Network.loadingFailed: "${params.errorText}"`);
                }

                reject(new Error('Load(html) unable to load remote URL'));
            });

            Network.requestWillBeSent((params) => {
                if (completed === true) {
                    postResolvedRequests[params.requestId] = 1;
                }
            });

            Network.responseReceived((params) => {
                if (options.debug) {
                    console.log(`Load(html) Response Received: (${params.requestId}) Status: ${params.response.status}`);
                }

                if (completed === true) {
                    delete postResolvedRequests[params.requestId];
                    if (postResolvedRequests.length === 0) {
                        clearTimeout(waitForResponse);
                        complete(resolveOptions);
                    }
                }
            });

            Page.navigate({url});
            await Page.loadEventFired();
            if (options.debug) {
                console.log('Load(html) resolved');
            }

            let waitForResponse = false;

            if (failed) {
                await CDP.Close({
                    port: options.port,
                    id:   target.id
                });
            }

            completed       = true;
            waitForResponse = setTimeout(complete, 750, resolveOptions);
        });
    } catch (error) {
        console.log(`Load(html) error: ${error}`);
        if (target) {
            console.log('Load(html) closing open target');
            CDP.Close({
                port: options.port,
                id:   target.id
            });
        }
    }
}
const htmlToElement = function(document, string) {
    const template     = document.createElement('template');
    template.innerHTML = string.trim();

    return template.content.firstChild;
}

const createHeader = function(document, printOptions) {
    const header = htmlToElement(document, (printOptions.headerSettings.enabled && printOptions.headerContent) ? printOptions.headerContent : '<header></header>');

    if (printOptions.headerSettings.enabled) {
        for (const [property, value] of Object.entries(printOptions.headerSettings.style || {})) {
            const prop         = camelCase(property);
            header.style[prop] = value;
        }
    }

    return header;
}

const contentToDOM = function(content, printOptions) {
    const dom      = new jsdom.JSDOM(content);
    const document = dom.window.document;
    const header   = createHeader(document, printOptions);

    if(header) {
        document.body.prepend(header);
    }

    return document;
}

function dumpContentToDisk(content, options) {
    if (options.debug_sources) {
        const randomPrefixedHtmlFile = uniqueFilename(options.dir + '/sources/');
        fs.writeFile(randomPrefixedHtmlFile, content, (error) => {
            if (error) {
                throw error;
            }
        });

        console.log(`Wrote HTML file ${randomPrefixedHtmlFile} successfully`);
    }
}

export {load, contentToDOM, dumpContentToDisk};
