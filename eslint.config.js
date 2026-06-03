const commonRules = {
    'no-constant-condition': 'error',
    'no-dupe-keys': 'error',
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-irregular-whitespace': 'error',
    'no-redeclare': 'error',
    'no-unreachable': 'error',
    'no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
    }],
    'no-undef': 'error',
    eqeqeq: ['error', 'always'],
    curly: ['error', 'all']
};

const nodeGlobals = {
    __dirname: 'readonly',
    console: 'readonly',
    module: 'readonly',
    process: 'readonly',
    require: 'readonly',
    setTimeout: 'readonly'
};

module.exports = [
    {
        ignores: [
            'dist/**',
            'node_modules/**'
        ]
    },
    {
        files: [
            'src/github-client.js',
            'src/main.js',
            'src/notification-policy.js',
            'src/preload.js',
            'test/**/*.js',
            'eslint.config.js'
        ],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: nodeGlobals
        },
        rules: commonRules
    },
    {
        files: ['src/renderer.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'script',
            globals: {
                CSS: 'readonly',
                document: 'readonly',
                window: 'readonly'
            }
        },
        rules: commonRules
    }
];
