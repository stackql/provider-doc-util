const cmdDesc = 'Creates and builds documents for stackql provider interfaces.';
const devDesc = 'Creates development documents for stackql provider interfaces.  These documents can be reviewed and modified as required, then packaged (using the build command) for local testing with stackql, and publishing to the stackql-provider-registry.';
const buildDesc = 'Packages documents generated using the dev command, enabling local testing of the stackql provider and publishing to the stackql-provider-registry.';
const providerNameDesc = 'Desired name for the provider, this will be shown in "SHOW PROVIDERS" and used to access resources in stackql.';
const providerVerDesc = 'StackQL provider version, shown in "REGISTRY LIST", semantic versioning is supported, versions should be prefixed with a "v", for example "v1".';

const devUsage = [
    {
      header: 'provider-doc-util dev',
      content: devDesc
    },
    {
      header: 'Synopsis',
      content: '$ provider-doc-util dev <arguments> <flags>'
    },
    {
      header: 'Arguments',
      content: [
        { name: 'apiDoc', summary: 'OpenAPI specification for the provider you are developing a stackql provider interface for.' },
        { name: 'stackqlProviderName', summary: providerNameDesc },
        { name: 'stackqlProviderVersion', summary: providerVerDesc },
      ]
    },
    {
        header: 'Flags',
        optionList: [
          {
            name: 'svcdiscriminator',
            alias: 's',
            type: String,
            typeLabel: '{underline JSONPath expression OR svcName:servicename}',
            description: 'Service discriminator, used to split a large OpenAPI spec into stackql service scoped documents using a JSONPath expression relative to each operation. Specify svcName:servicename to create one service named <servicename>.',
          },
          {
            name: 'resdiscriminator',
            alias: 'r',
            type: String,
            typeLabel: '{underline JSONPath expression}',
            description: 'Resource discriminator, used to identify stackql resources from a providers OpenAPI spec.',
          },
          {
            name: 'methodkey',
            alias: 'm',
            type: String,
            typeLabel: '{underline JSONPath expression}',
            description: 'Used to identify resource methods from a providers OpenAPI spec. (defaults to $.operationId)',
          },
          {
            name: 'output',
            alias: 'o',
            type: String,
            typeLabel: '{underline directory}',
            description: 'Directory to write the generated stackql provider development documents to. (defaults to cwd)',
          },
          {
            name: 'format',
            alias: 'f',
            type: String,
            typeLabel: '{underline yaml, json, toml or hcl}',
            description: 'Output format for stackql provider and resource definitions. (defaults to toml)',
          },
          {
            name: 'debug',
            alias: 'd',
            type: Boolean,
            description: 'Debug flag. (defaults to false)',
          },                                        
        ]
      }    
];

const cmdUsage = [
    {
      header: 'provider-doc-util',
      content: cmdDesc
    },
    {
      header: 'Synopsis',
      content: '$ provider-doc-util <command> <options>'
    },
    {
      header: 'Command List',
      content: [
        { name: 'dev', summary: devDesc },
        { name: 'build', summary: buildDesc },
      ]
    },
];

const buildUsage = [
    {
        header: 'provider-doc-util build',
        content: buildDesc
      },
      {
        header: 'Synopsis',
        content: '$ provider-doc-util build <arguments> <flags>'
      },
      {
        header: 'Arguments',
        content: [
          { name: 'providerDevDocRoot', summary: 'Source directory containing stackql provider development documents generated using the dev command.' },
          { name: 'stackqlProviderName', summary: providerNameDesc },
          { name: 'stackqlProviderVersion', summary: providerVerDesc },
        ]
      },
      {
          header: 'Flags',
          optionList: [
            {
              name: 'output',
              alias: 'o',
              type: String,
              typeLabel: '{underline directory}',
              description: 'Directory to write the generated stackql provider documents to. (defaults to cwd)',
            },
            {
              name: 'debug',
              alias: 'd',
              type: Boolean,
              description: 'Debug flag. (defaults to false)',
            },                                        
          ]
        }
];

export default {
  cmdUsage,
  buildUsage,
  devUsage,
}
