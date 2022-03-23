import arg from 'arg';
const process = require('process');
const OpenAPIParser = require("@readme/openapi-parser");
const yaml = require('js-yaml');
const fs = require('fs');
const jp = require('jsonpath');
var hcl = require("js-hcl-parser");
var toml = require('@iarna/toml');

function parseArgumentsIntoOptions(rawArgs) {
 const args = arg(
   {
     '--svcdiscriminator': String,
     '--resdiscriminator': String,
     '--methodKey': String,
     '--output': String,
     '--format': String,
     '--debug': Boolean,
     '-s': '--svcdiscriminator',
     '-r': '--resdiscriminator',
     '-m': '--methodkey',
     '-o': '--output',
     '-f': '--format',
     '-d': '--debug',
   },
   {
     argv: rawArgs.slice(2),
   }
 );
 return {
   methodKey: args['--methodkey'] || 'operationId',
   svcDiscriminator: args['--svcdiscriminator'] || false,
   resDiscriminator: args['--resdiscriminator'] || false,
   outputDir: args['--output'] || process.cwd(),
   outputFormat: args['--format'] || 'toml',
   debug: args['--debug'] || false,
   operation: args._[0] || false,
   apiDocOrDir: args._[1] || false,
   stackqlProviderName: args._[2] || false,
   stackqlProviderVersion: args._[3] || false,
 };
}

function printUsage(operation) {
    console.log("usage:");
    console.log(" provider-doc-util");
    switch(operation) {
        case 'dev':
            console.log("  dev");
            console.log("  apiDoc");
            console.log("  stackqlProviderName");
            console.log("  stackqlProviderVersion");
            console.log("  --svcDiscriminator | -s <JSONPath expression> OR <svcName:servicename>");
            console.log("  --resDiscriminator | -r <JSONPath expression>");
            console.log("  [--methodkey | -m <JSONPath expression>]");
            console.log("  [--output | -o <outputdir>]");
            console.log("  [--format | -f < yaml | json | toml | hcl >]");  
            console.log("  [--debug | -d ]");       
            break;
        case 'build':
            console.log("  build");
            console.log("  providerDevDocRoot");
            console.log("  stackqlProviderName");
            console.log("  stackqlProviderVersion");
            console.log("  [--output | -o <outputdir>]");
            console.log("  [--debug | -d ]");       
            break;
        default:
            console.log("  operation (dev or build)");
      } 
      
}

function serializeData(data, format){
    switch(format) {
        case 'yaml':
            return yaml.dump(data);
        case 'hcl':
            return hcl.stringify(JSON.stringify(data));
        case 'json':
            return JSON.stringify(data);
        default:
            // toml
            return toml.stringify(data);
      };
}

function deserializeData(str, format){
    switch(format) {
        case 'yaml':
            return yaml.load(str);
        case 'hcl':
            return JSON.parse(hcl.parse(str));
        case 'json':
            return JSON.parse(str);
        default:
            // toml
            return toml.parse(str);
      };
}

export async function cli(args) {
    //
    // parse command line args
    //
    let options = parseArgumentsIntoOptions(args);
    let operation = "";
    if (!options.operation){
        printUsage('unknown');
        return
    } else {
        operation = options.operation;
        if (operation != 'dev' && operation != 'build'){
            printUsage('unknown');
            return            
        }
    };
 
    //
    // build provider package
    //
    if (operation == 'build'){
        if (!options.apiDocOrDir || !options.stackqlProviderName || !options.stackqlProviderVersion){
            printUsage('build');
            return            
        } else {
            const providerDevDocRoot = options.apiDocOrDir;
            const providerName = options.stackqlProviderName;
            const providerVersion = options.stackqlProviderVersion;
            const outputDir = options.outputDir;
            try {
                // clean build dir
                const buildDir = `${outputDir}/${providerName}/${providerVersion}`;
                if (fs.existsSync(buildDir)){
                    console.log(`cleaning build dir (${buildDir})...`);
                    fs.rmSync(buildDir, { recursive: true });
                };
                const docDir = `${providerDevDocRoot}/${providerName}/${providerVersion}`;
                console.log("looking for dev docs in %s...", docDir);
                // check if dir exists
                if (!fs.existsSync(docDir)){
                    console.log(`ERROR: ${docDir} does not exist`);
                    return
                };
                // look provider doc
                const providerDocs = [
                    `${docDir}/provider.toml`,
                    `${docDir}/provider.yaml`,
                    `${docDir}/provider.json`,
                    `${docDir}/provider.hcl`,
                ];
                let providerDoc = false;
                for (let i = 0; i < providerDocs.length; i++){
                    if (fs.existsSync(providerDocs[i])){
                        providerDoc = providerDocs[i];
                        break;
                    }
                };
                if (!providerDoc){
                    console.log(`ERROR: no provider doc found in ${docDir}`);
                    return
                };
                // convert provider doc to json
                let providerDocJson = false;
                switch(providerDoc.split('.').pop()) {
                    case 'toml':
                        console.log("converting toml to json...");
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'toml');
                        break;
                    case 'yaml':
                        console.log("converting yaml to json...");    
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'yaml');
                        break;
                    case 'json':
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'json');
                        break;
                    case 'hcl':
                        console.log("converting hcl to json...");    
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'hcl');
                        break;
                    default:
                        console.log(`ERROR: unknown provider doc format ${providerDoc.split('.').pop()}`);
                        return
                };
                // make package dirs
                const servicesOutDir = `${buildDir}/${providerName}/${providerVersion}/services`; 
                if (!fs.existsSync(servicesOutDir)){
                    fs.mkdirSync(servicesOutDir, { recursive: true });
                }
                const providerOutFile = `${buildDir}/${providerName}/${providerVersion}/provider.json`;
                console.log("writing provider doc to %s...", providerOutFile);
                fs.writeFileSync(providerOutFile, serializeData(providerDocJson, 'json'));
                // look for services dir
                const svcsInputDir = `${docDir}/services`;
                if (!fs.existsSync(svcsInputDir)){
                    console.log(`ERROR: ${svcsInputDir} does not exist`);
                    return
                };    
                // iterate through services dir
                const services = fs.readdirSync(svcsInputDir);
                for (const service of services) {
                    let outputObj = {};
                    console.log(`processing ${service}...`);
                    // get openapi doc
                    let openapiDocFile = `${svcsInputDir}/${service}/${service}-${providerVersion}.yaml`;
                    if (!fs.existsSync(openapiDocFile)){
                        console.log(`ERROR: ${openapiDocFile} does not exist`);
                        return
                    };
                    let openapiData = await OpenAPIParser.parse(deserializeData(fs.readFileSync(openapiDocFile, 'utf8'), 'yaml'), {resolve: {http: false}});
                    // get stackql resource definitions
                    let svcDir = fs.readdirSync(`${svcsInputDir}/${service}`);
                    let resourcesDef = false;
                    for (const defFile of svcDir) {
                        if (defFile.endsWith('-resources.toml')){
                            resourcesDef = deserializeData(fs.readFileSync(`${svcsInputDir}/${service}/${defFile}`, 'utf8'), 'toml');
                        } else if (defFile.endsWith('-resources.yaml')){
                            resourcesDef = deserializeData(fs.readFileSync(`${svcsInputDir}/${service}/${defFile}`, 'utf8'), 'yaml');
                        } else if (defFile.endsWith('-resources.json')){
                            resourcesDef = deserializeData(fs.readFileSync(`${svcsInputDir}/${service}/${defFile}`, 'utf8'), 'json');
                        } else if (defFile.endsWith('-resources.hcl')){
                            resourcesDef = deserializeData(fs.readFileSync(`${svcsInputDir}/${service}/${defFile}`, 'utf8'), 'hcl');
                        };
                    };
                    Object.keys(openapiData).forEach(openapiKey => {
                        outputObj[openapiKey] = openapiData[openapiKey];
                    });
                    outputObj['components']['x-stackQL-resources'] = resourcesDef['components']['x-stackQL-resources'];
                    // write service doc to output dir
                    const outputFile = `${servicesOutDir}/${service}-${providerVersion}.json`;
                    console.log("writing service doc to %s...", outputFile);
                    fs.writeFileSync(outputFile, serializeData(outputObj, 'json'));
                }
            } catch (err) {     
                console.error(err);
            };
        };
    };

    //
    // make dev docs using discriminators and prepare stackql resource defs
    //
    if (operation == 'dev'){
        if (!options.apiDocOrDir || !options.stackqlProviderName || !options.stackqlProviderVersion || !options.svcDiscriminator || !options.resDiscriminator){
            printUsage(operation);
            return
        } else {
            const apiDoc = options.apiDocOrDir;
            const provider = options.stackqlProviderName;
            const version = options.stackqlProviderVersion;
            const svcDiscriminator = options.svcDiscriminator;
            const resDiscriminator = options.resDiscriminator;
            const methodKey = options.methodKey;
            const outputDir = options.outputDir;
            const outputFormat = options.outputFormat;
            const debug = options.debug;
            if (options.debug){
                console.log(`API doc : ${apiDoc}`);
                console.log(`Stackql Provider Name : ${provider}`);
                console.log(`Stackql Provider Version : ${version}`);
                console.log(`Service discriminator : ${svcDiscriminator}`);
                console.log(`Resource discriminator : ${resDiscriminator}`);
                console.log(`StackQL method key : ${methodKey}`);
                console.log(`Output directory : ${outputDir}`);
                console.log(`Output format : ${outputFormat}`);
                console.log(`Debug : ${debug}`);
            };
            try {
                // clean dev dir
                const devDir = `${outputDir}/${provider}/${version}`;
                if (fs.existsSync(devDir)){
                    console.log(`cleaning dev dir (${devDir})...`);
                    fs.rmSync(devDir, { recursive: true });
                };
                let api = await OpenAPIParser.parse(apiDoc, {resolve: {http: false}});
                const apiPaths = api.paths;
                let svcMap = {}; // to hold open api spec paths by service
                let providerdef = {}; // to hold stackql entry point
                let resMap = {}; // to hold stackql resources defs for each service
                providerdef['providerServices'] = {};            
                if (options.debug){
                    console.log("API name: %s, Version: %s", api.info.title, api.info.version);
                };
                Object.keys(apiPaths).forEach(pathKey => {
                    Object.keys(apiPaths[pathKey]).forEach(verbKey => {
                        let operationId = apiPaths[pathKey][verbKey][methodKey].split("/")[1].replace(/-/g, "_"); 
                        let service = "svc";
                        if (svcDiscriminator.startsWith('svcName:')){
                            service = svcDiscriminator.split(":")[1];
                        } else {
                            service = jp.query(apiPaths[pathKey][verbKey], svcDiscriminator)[0];
                        };
                        let resValue = jp.query(apiPaths[pathKey][verbKey], resDiscriminator)[0];
                        let resource = resValue ? resValue : service;
                        if (options.debug){
                            console.log("api %s:%s", pathKey, verbKey);
                            console.log("stackqlService : %s", service);
                            console.log("stackqlResource : %s", resource);
                            console.log("stackqlMethod : %s", operationId);
                            console.log("--------------------------");
                        };
                        if (Object.keys(svcMap).indexOf(service) === -1){
                            // init service map
                            svcMap[service] = {};
                            svcMap[service]['paths'] = {};
                            // init resource map
                            resMap[service] = {};
                            // init provider services
                            providerdef['providerServices'][service] = {};
                            providerdef['providerServices'][service]['paths'] = {};
                            providerdef['providerServices'][service]['description'] = service;
                            providerdef['providerServices'][service]['id'] = `${service}:${version}`;
                            providerdef['providerServices'][service]['name'] = service;
                            providerdef['providerServices'][service]['preferred'] = true;
                            providerdef['providerServices'][service]['service'] = 
                            {
                                '$ref': `${provider}/${version}/services/${service}/${service}-${version}.yaml`
                            };
                            providerdef['providerServices'][service]['title'] = service;
                            providerdef['providerServices'][service]['version'] = version;
                        };
                        if (Object.keys(svcMap[service]).indexOf(pathKey) === -1){
                            svcMap[service]['paths'][pathKey] = {};
                        };
                        svcMap[service]['paths'][pathKey][verbKey] = apiPaths[pathKey][verbKey];
                        if (Object.keys(resMap[service]).indexOf(resource) === -1){
                            resMap[service][resource] = {};
                            resMap[service][resource]['id'] = `${provider}.${service}.${resource}`;
                            resMap[service][resource]['name'] = resource;
                            resMap[service][resource]['title'] = resource;
                            resMap[service][resource]['methods'] = {};
                            resMap[service][resource]['sqlVerbs'] = {};
                            resMap[service][resource]['sqlVerbs']['select'] = [];
                            resMap[service][resource]['sqlVerbs']['insert'] = [];
                            resMap[service][resource]['sqlVerbs']['delete'] = [];
                        };
                        resMap[service][resource]['methods'][operationId] = {};
                        resMap[service][resource]['methods'][operationId]['operation'] = {};
                        resMap[service][resource]['methods'][operationId]['operation']['$ref'] = verbKey.toUpperCase();
                        resMap[service][resource]['methods'][operationId]['path'] = {};
                        resMap[service][resource]['methods'][operationId]['path']['$ref'] = pathKey;
                        resMap[service][resource]['methods'][operationId]['response'] = {};
                        resMap[service][resource]['methods'][operationId]['response']['mediaType'] = 'application/json';
                        // get openAPIDocKey
                        let responseCode = 'default';
                        Object.keys(apiPaths[pathKey][verbKey]['responses']).forEach(respKey => {
                            if (respKey.startsWith('2')){
                                responseCode = respKey;
                            };
                        });
                        resMap[service][resource]['methods'][operationId]['response']['openAPIDocKey'] = responseCode;
                        resMap[service][resource]['methods'][operationId]['response']['objectKey'] = 'items';
                        if (operationId.startsWith('get') || operationId.startsWith('list')){
                            resMap[service][resource]['sqlVerbs']['select'].push(
                                {'$ref': `#/components/x-stackQL-resources/${resource}/methods/${operationId}`}
                            );
                        };                    
                    });
                });
        
                // write out provider doc
                providerdef['openapi'] = api.openapi;
                providerdef['id'] = provider;
                providerdef['name'] = provider;
                providerdef['version'] = version;
                providerdef['description'] = api.info.description;
                providerdef['title'] = api.info.title;
                const rootDir = `${outputDir}/${provider}/${version}`;
                console.log(`writing ${rootDir}/provider.${outputFormat}`);
                if (!fs.existsSync(rootDir)){
                    fs.mkdirSync(rootDir);
                }
                fs.writeFileSync(`${rootDir}/provider.${outputFormat}`, serializeData(providerdef, outputFormat), (err) => {
                    if (err) {
                        console.log(err);
                    }
                });
        
                let svcDir = "";
                // write out openapi service docs
                Object.keys(svcMap).forEach(svcKey => {
                    svcDir = `${rootDir}/services/${svcKey}`;
                    if (!fs.existsSync(svcDir)){
                        fs.mkdirSync(svcDir, { recursive: true });
                    }
                    svcMap[svcKey]['openapi'] = api.openapi;
                    svcMap[svcKey]['info'] = api.info;
                    svcMap[svcKey]['tags'] = api.tags;
                    svcMap[svcKey]['servers'] = api.servers;
                    svcMap[svcKey]['externalDocs'] = api.externalDocs;
                    svcMap[svcKey]['components'] = api.components;
                    console.log(`writing ${svcDir}/${svcKey}-${version}.yaml`);
                    fs.writeFileSync(`${svcDir}/${svcKey}-${version}.yaml`, serializeData(svcMap[svcKey], 'yaml'), (err) => {
                        if (err) {
                            console.log(err);
                        }
                    });
                });
        
                // write out stackql resources docs
                Object.keys(resMap).forEach(svcKey => {
                    svcDir = `${rootDir}/services/${svcKey}`;
                    console.log(`writing ${svcDir}/${svcKey}-${version}-resources.${outputFormat}`);
                    let resourcesDoc = {};
                    resourcesDoc['components'] = {};
                    resourcesDoc['components']['x-stackQL-resources'] = resMap[svcKey];
                    fs.writeFileSync(`${svcDir}/${svcKey}-${version}-resources.${outputFormat}`, serializeData(resourcesDoc, outputFormat), (err) => {
                        if (err) {
                            console.log(err);
                        }
                    });                
                });
        
        
            } catch(err) {
                console.error(err);
            };
        }
    }
}