const arg = require('arg');
const commandLineUsage = require('command-line-usage');
const process = require('process');
const OpenAPIParser = require("@readme/openapi-parser");
const yaml = require('js-yaml');
const fs = require('fs');
const jp = require('jsonpath');
const hcl = require("js-hcl-parser");
const toml = require('@iarna/toml');
import usage from './usage.js';

function showUsage(operation) {
    switch(operation) {
        case 'dev':
            console.log(commandLineUsage(usage.devUsage));
            break;
        case 'build':
            console.log(commandLineUsage(usage.buildUsage));
            break;
        default:
            console.log(commandLineUsage(usage.cmdUsage));
    };
}

function parseArgumentsIntoOptions(rawArgs) {
 const args = arg(
   {
     '--svcdiscriminator': String,
     '--resdiscriminator': String,
     '--methodkey': String,
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

function cleanDir(dir){
    if (fs.existsSync(dir)){
        console.log(`cleaning dir (${dir})...`);
        fs.rmSync(dir, { recursive: true });
    };
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

function getSqlVerb(operationId){
    let verb = 'exec';
    if (operationId.startsWith('get') || operationId.startsWith('list')){
        verb = 'select';
    } else if (operationId.startsWith('create')){
        verb = 'insert';
    } else if (operationId.startsWith('delete')){
        verb = 'delete';
    };
    return verb;
}

function getResponseCode(responses){
    let respcode = '200';    
    Object.keys(responses).forEach(respKey => {
        if (respKey.startsWith('2')){
            respcode = respKey;
        };
    });
    return respcode;
}

export async function cli(args) {
    //
    // parse command line args
    //
    const options = parseArgumentsIntoOptions(args);
    const operation = options.operation || false;
    const apiDocOrDir = options.apiDocOrDir || false;
    const providerName = options.stackqlProviderName || false;
    const providerVersion = options.stackqlProviderVersion || false;
    const outputDir = options.outputDir;
    const debug = options.debug;

    if (!operation){
        showUsage('unknown');
        return
    } else {
        if (operation !== 'dev' && operation !== 'build'){
            showUsage('unknown');
            return            
        }
    };
 
    //
    // build provider package
    //
    if (operation == 'build'){
        if (!apiDocOrDir || !providerName || !providerVersion){
            showUsage('build');
            return            
        } else {
            const providerDevDocRoot = apiDocOrDir;
            try {
                // clean build dir
                const buildDir = `${outputDir}/${providerName}/${providerVersion}`;
                cleanDir(buildDir);
                
                // find root provider doc
                const docDir = `${providerDevDocRoot}/${providerName}/${providerVersion}`;
                console.log(`looking for dev docs in ${docDir}...`);
                if (!fs.existsSync(docDir)){
                    console.log(`ERROR: ${docDir} does not exist`);
                    return
                };
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
                        console.log('converting toml to json...');
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'toml');
                        break;
                    case 'yaml':
                        console.log('converting yaml to json...');    
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'yaml');
                        break;
                    case 'json':
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'json');
                        break;
                    case 'hcl':
                        console.log('converting hcl to json...');    
                        providerDocJson = deserializeData(fs.readFileSync(providerDoc, 'utf8'), 'hcl');
                        break;
                    default:
                        console.log(`ERROR: unknown provider doc format ${providerDoc.split('.').pop()}`);
                        return
                };

                // make package dirs and create provider index doc
                const outputFileType = 'yaml';
                const servicesOutDir = `${buildDir}/services`; 
                if (!fs.existsSync(servicesOutDir)){
                    fs.mkdirSync(servicesOutDir, { recursive: true });
                }
                const providerOutFile = `${buildDir}/provider.${outputFileType}`;
                console.log(`writing provider doc to ${providerOutFile}...`);
                fs.writeFileSync(providerOutFile, serializeData(providerDocJson, outputFileType));
                
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
                
                    // create service dir and write service doc
                    fs.mkdirSync(`${servicesOutDir}/${service}`);
                    const outputFile = `${servicesOutDir}/${service}/${service}-${providerVersion}.${outputFileType}`;
                    console.log(`writing service doc to ${outputFile}...`);
                    fs.writeFileSync(outputFile, serializeData(outputObj, outputFileType));
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
        if (!apiDocOrDir || !providerName || !providerVersion || !options.svcDiscriminator || !options.resDiscriminator){
            showUsage(operation);
            return
        } else {
            // get options
            const apiDoc = apiDocOrDir;
            const svcDiscriminator = options.svcDiscriminator;
            const resDiscriminator = options.resDiscriminator;
            const methodKey = options.methodKey;
            const outputFormat = options.outputFormat;
            if (options.debug){
                console.log(`API doc : ${apiDoc}`);
                console.log(`Stackql Provider Name : ${providerName}`);
                console.log(`Stackql Provider Version : ${providerVersion}`);
                console.log(`Service discriminator : ${svcDiscriminator}`);
                console.log(`Resource discriminator : ${resDiscriminator}`);
                console.log(`StackQL method key : ${methodKey}`);
                console.log(`Output directory : ${outputDir}`);
                console.log(`Output format : ${outputFormat}`);
                console.log(`Debug : ${debug}`);
            };

            try {
                // clean dev dir
                const devDir = `${outputDir}/${providerName}/${providerVersion}`;
                cleanDir(devDir);

                // parse openapi doc
                let api = await OpenAPIParser.parse(apiDoc, {resolve: {http: false}});
                const apiPaths = api.paths;

                // init output objects
                let svcMap = {}; // to hold open api spec paths by service
                let providerdef = {}; // to hold stackql entry point
                let resMap = {}; // to hold stackql resources defs for each service
                providerdef['providerServices'] = {};            
                if (options.debug){
                    console.log(`API name: ${api.info.title}, Version: ${api.info.version}`);
                };

                // iterate through openapi operations
                Object.keys(apiPaths).forEach(pathKey => {
                    Object.keys(apiPaths[pathKey]).forEach(verbKey => {
                        let operationId = apiPaths[pathKey][verbKey][methodKey].split('/')[1].replace(/-/g, '_'); 
                        let service = 'svc';
                        let sqlVerb = false;
                        let responseCode = 'default';
                        if (svcDiscriminator.startsWith('svcName:')){
                            service = svcDiscriminator.split(':')[1];
                        } else {
                            service = jp.query(apiPaths[pathKey][verbKey], svcDiscriminator)[0];
                        };
                        let resValue = jp.query(apiPaths[pathKey][verbKey], resDiscriminator)[0];
                        let resource = resValue ? resValue : service;
                        if (options.debug){
                            console.log(`api ${pathKey}:${verbKey}`);
                            console.log(`stackqlService : ${service}`);
                            console.log(`stackqlResource : ${resource}`);
                            console.log(`stackqlMethod : ${operationId}`);
                            console.log('--------------------------');
                        };
                        
                        if (!svcMap.hasOwnProperty(service)){
                            // fisrt occurance of the service, init service map
                            svcMap[service] = {};
                            svcMap[service]['paths'] = {};

                            // init resource map
                            resMap[service] = {};
                            
                            // init provider services
                            providerdef['providerServices'][service] = {};
                            providerdef['providerServices'][service]['description'] = service;
                            providerdef['providerServices'][service]['id'] = `${service}:${providerVersion}`;
                            providerdef['providerServices'][service]['name'] = service;
                            providerdef['providerServices'][service]['preferred'] = true;
                            providerdef['providerServices'][service]['service'] = 
                            {
                                '$ref': `${providerName}/${providerVersion}/services/${service}/${service}-${providerVersion}.yaml`
                            };
                            providerdef['providerServices'][service]['title'] = service;
                            providerdef['providerServices'][service]['version'] = providerVersion;
                        };

                        if (!svcMap[service]['paths'].hasOwnProperty(pathKey)){
                            svcMap[service]['paths'][pathKey] = {};
                            svcMap[service]['paths'][pathKey][verbKey] = apiPaths[pathKey][verbKey];
                        } else {
                            svcMap[service]['paths'][pathKey][verbKey] = apiPaths[pathKey][verbKey];
                        };

                        
                        if (!resMap[service].hasOwnProperty(resource)){
                            // first occurance of the resource, init resource map
                            resMap[service][resource] = {};
                            resMap[service][resource]['id'] = `${providerName}.${service}.${resource}`;
                            resMap[service][resource]['name'] = resource;
                            resMap[service][resource]['title'] = resource;
                            resMap[service][resource]['methods'] = {};
                            resMap[service][resource]['sqlVerbs'] = {};
                            resMap[service][resource]['sqlVerbs']['select'] = [];
                            resMap[service][resource]['sqlVerbs']['insert'] = [];
                            resMap[service][resource]['sqlVerbs']['update'] = [];
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
                        responseCode = getResponseCode(apiPaths[pathKey][verbKey]['responses']);
                        resMap[service][resource]['methods'][operationId]['response']['openAPIDocKey'] = responseCode;
                        resMap[service][resource]['methods'][operationId]['response']['objectKey'] = 'items';
                        
                        // map sql verbs
                        sqlVerb = getSqlVerb(operationId);                       
                        switch (sqlVerb) {
                            case 'select':
                                resMap[service][resource]['sqlVerbs']['select'].push({'$ref': `#/components/x-stackQL-resources/${resource}/methods/${operationId}`});
                                break;
                            case 'insert':
                                resMap[service][resource]['sqlVerbs']['insert'].push({'$ref': `#/components/x-stackQL-resources/${resource}/methods/${operationId}`});
                                break;
                            case 'delete':
                                resMap[service][resource]['sqlVerbs']['delete'].push({'$ref': `#/components/x-stackQL-resources/${resource}/methods/${operationId}`});
                                break;
                            default:
                                break;
                        };
                   
                    });
                });
        
                // write out provider doc
                providerdef['openapi'] = api.openapi;
                providerdef['id'] = providerName;
                providerdef['name'] = providerName;
                providerdef['version'] = providerVersion;
                providerdef['description'] = api.info.description;
                providerdef['title'] = api.info.title;
                const rootDir = `${outputDir}/${providerName}/${providerVersion}`;
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
                    console.log(`writing ${svcDir}/${svcKey}-${providerVersion}.yaml`);
                    fs.writeFileSync(`${svcDir}/${svcKey}-${providerVersion}.yaml`, serializeData(svcMap[svcKey], 'yaml'), (err) => {
                        if (err) {
                            console.log(err);
                        }
                    });
                });
        
                // write out stackql resources docs
                Object.keys(resMap).forEach(svcKey => {
                    svcDir = `${rootDir}/services/${svcKey}`;
                    console.log(`writing ${svcDir}/${svcKey}-${providerVersion}-resources.${outputFormat}`);
                    let resourcesDoc = {};
                    resourcesDoc['components'] = {};
                    resourcesDoc['components']['x-stackQL-resources'] = resMap[svcKey];
                    fs.writeFileSync(`${svcDir}/${svcKey}-${providerVersion}-resources.${outputFormat}`, serializeData(resourcesDoc, outputFormat), (err) => {
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