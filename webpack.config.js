const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const SiteConfiguration = require('./config/presentation');

const frontEndConfig = {
    mode: 'production',
    devtool: 'inline-source-map',
    target: 'web',
    entry: {
        'pages/view': './src/ts/views/view.ts',
        'pages/access': './src/ts/views/access.ts',
        'pages/error': './src/ts/views/error.ts'
    },
    module: {
        rules: [
            {
                test: /(\.js|\.ts)$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    },
    resolve: {
        extensions: ['.ts', '.js', '.json']
    },
    plugins: [
        new HtmlWebpackPlugin({
            filename: 'pages/view.html',
            template: path.resolve('src/html/view.html'),
            templateParameters: {
                config: SiteConfiguration
            },
            chunks: ['pages/view'],
            inject: false
        }),
        new HtmlWebpackPlugin({
            filename: 'pages/access.html',
            template: path.resolve('src/html/access.html'),
            templateParameters: {
                config: SiteConfiguration
            },
            chunks: ['pages/access'],
            inject: false
        }),
        new HtmlWebpackPlugin({
            filename: 'pages/error.html',
            template: path.resolve('src/html/error.html'),
            templateParameters: {
                config: SiteConfiguration
            },
            chunks: ['pages/error'],
            inject: false
        })
    ],
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'bin')
    }
};

const serverConfig = {
    mode: 'production',
    target: 'node',
    entry: {
        'server': './src/ts/server.ts'
    },
    module: {
        rules: [
            {
                test: /(\.js|\.ts)$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            }
        ]
    },
    resolve: {
        extensions: ['.js', '.json', '.ts']
    },
    optimization: {
        minimize: false
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'bin')
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/static', to: 'static' },
                { from: 'certs', to: 'certs' },
                { from: 'config', to: 'config' }
            ]
        })
    ]
};

module.exports = [ serverConfig, frontEndConfig ];