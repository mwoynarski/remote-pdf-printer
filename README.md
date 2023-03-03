# remote-pdf-printer
Converts a URL or HTML into PDF via Headless Google Chrome instance

# End Points

PNG
* /png [POST]
* /png/:file [GET]

PDF
* /pdf [POST]
* /pdf/:file [GET]
* /pdf/preview [POST]
* /pdf/preview/:file [GET]


Both /pdf and /png POST expect x-www-form-urlencoded data.

data = html content OR
url = a url to retrieve and convert

Both data and url can be an array of urls or data.

download=true will return the actual data, without download=true you'll get a json response like this
and can use the GET .../:file urls to retrieve the files.

~~~
{ 
    "success":true,
    "pages":"1",
    "images": [
        "https://remote-pdf.prolegis.ca:3000/pdf/preview/9c2cd04b-1.jpg"
    ]
}
~~~

There are also the following additional parameters:

```
marginTop  = top page margin
marginLeft = left page margin
marginRight = right page margin
marginBottom = bottom page margin
```

```
header = HTML/CSS content to be used as the document header.
  if header is provided, marginTop is a required parameter.
footer = HTML/CSS content to be used as the document footer.
  if footer is provided, marginBottom is a required parameter.
```

## Setting up remote debugging for PHPStorm

Modify the service definition at `/usr/lib/systemd/system/remote-pdf-printer.service` and set the `--inspect` flag, passing the listening IP and Port:

```
ExecStart=/usr/bin/node --inspect=<virtual machine IP>:<desired port> /var/lib/remote-pdf-printer/server.js
```
The default node debugging port is 9229. Example:
```
ExecStart=/usr/bin/node --inspect=192.168.100.102:9229 /var/lib/remote-pdf-printer/server.js
```

Ensure that the relevant firewall services, etc, allow for connections on this IP and Port

In PHPStorm, make sure the `Node.js Remote Interpreter` plugin is installed

Go to **Run > Edit Configurations**, click `+`, and create a new `Attach to Node.js/Chrome`.  Give the new configuration a name, set the host IP and Port to the values entered in the service definition, and select `Attach to: Chrome or Node.js > 6.3 started with --inspect`.

You can now select this run configuration from the debug dropdown in the top right toolbar. 

## Enable remote execution of local files

If you need to execute local workstation files in the VM's environment, you can configure the remote interpreter.

Make sure the `Node.js Remote Interpreter` is installed.

Go to **Settings > Languages and Frameworks > Node.js**, click the dropdown for `Node interpreter`, and select `Add > Add Remote`.  Select `SSH`, and click `...` next to `SSH configuration`.

```
Host: prolegis.local (or your VM's name)
Username: root
Port: 22
Local port: <Dynamic>
Authentication type: OpenSSH config and authentication agent
```

Click `Test Connection` to ensure this works.  Click `OK`.

In the **Configure Node.js Remote Interpreter** dialog, select the SSH configuration you just entered, and set the `Node.js interpreter path` to `/usr/bin/node` (the path to Node on the vm).  Click `OK`.

In the **Settings > Languages and Frameworks > Node.js** dialog, select the `Node interpreter` you just entered, and click `OK`.

Go to **Run > Edit Configurations**, click `+`, and create a new `Node.js`. Give the configuration a name, set the `Node interpreter` to the one you just created above, set the `Working directory` to your project directory, select the `JavaScript file` you want to execute, and enter any `Environment Variables` that are needed for the project, and set up the `Path mappings`. Click `OK`.

From the dropdown in the top right menu, you can now select the remote interpreter and execute the configured file on the virtual machine.
