const path = require('path');

module.exports = {
    mode: 'development',
    devtool: 'inline-source-maps',
    entry: {
        view: './src/js/view.js'
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
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'bin', 'dist', 'js')
    }
}