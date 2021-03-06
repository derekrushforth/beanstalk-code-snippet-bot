import crc from 'easy-crc32'
import axios from 'axios'
import { padStart } from 'lodash'

// const NAME = 'Beanstalk Code Snippet Bot'
const LINES_OFFSET = 3

export function getSanitizedPath(path) {
    return path
        .replace(/^\//, '')
        .replace(/\/$/, '')
}

export function getLocCrc(filepath, lineNum) {
    return crc.calculate(getSanitizedPath(filepath)) + crc.calculate(`${ lineNum }`)
}

export function parseUrl(url) {
    const re = new RegExp(/([\w-_]+)\.beanstalkapp\.com\/([\w-_]+)\/browse\/git\/([\w-_/.]+)(\?ref=c-(\w+))?(#L(\d+))?/g) // eslint-disable-line
    const matches = re.exec(url)
    if (matches) {
        const [, accountName, repositoryName, filepath, ...rest] = matches
        const [, revision, , locHash] = rest
        return {
            accountName,
            repositoryName,
            filepath,
            locHash,
            revision
        }
    }
    return null
}

export function linesHashMap(content, filepath) {
    return content.split('\n').map((line, lineNumber) => getLocCrc(filepath, lineNumber + 1))
}

export function getLineNumberFromHash(locHash, content, filepath) {
    return linesHashMap(content, filepath).indexOf(parseInt(locHash, 10)) + 1
}

export function linesAsArrayWithLineNumbers(content) {
    const lines = content.split('\n')
    const padding = (`${ lines.length }`).length
    return lines.map((line, idx) => `${ padStart(idx + 1, padding, '0') }. ${ line }`)
}

export function getLinesAround(content, line, offset = LINES_OFFSET) {
    // line is 1-based so we will need to convert it to 0-based everywhere
    const lines = linesAsArrayWithLineNumbers(content)
    const totalLines = lines.length - 2
    const minLine = Math.max(line - 1 - offset, 0)
    const maxLine = Math.min(line - 1 + offset, totalLines)
    const newLines = minLine > 0 ? ['...'] : []
    for (let currLine = minLine; currLine <= maxLine; currLine++) {
        newLines.push(lines[currLine])
    }
    if (maxLine < totalLines) {
        newLines.push('...')
    }
    return newLines
}

export function getContentWithAttachements(response, url) {
    let lineNumber
    let fileContents
    const { locHash } = parseUrl(url)
    const { path, contents, revision, repository } = response.data
    if (locHash) {
        lineNumber = getLineNumberFromHash(locHash, contents, path)
        fileContents = getLinesAround(contents, lineNumber).join('\n')
    } else {
        fileContents = linesAsArrayWithLineNumbers(contents).join('\n')
    }


    return {
        username: path,
        text: `\`\`\`${ fileContents }\n\`\`\``,
        attachments: [{
            fallback: path,
            fields: [{
                title: 'Repository',
                value: repository.title,
                short: true
            }, {
                title: 'Revision',
                value: revision,
                short: true
            }]
        }]
    }
}

export function getFileContents(url, options, cb) {
    const { username, token } = options
    if (!username || !token) {
        throw new Error('Beanstalk username and token are required')
    }
    const { accountName, repositoryName, filepath, revision } = parseUrl(url)
    const apiUrl = `https://${ accountName }.beanstalkapp.com/api`
    const authStr = `${ username }:${ token }`
    const encodedAuthStr = new Buffer(authStr).toString('base64')
    axios
        .get(`${ apiUrl }/repositories/${ repositoryName }/node.json`, {
            params: {
                path: filepath,
                revision,
                contents: true
            },
            headers: {
                Authorization: `Basic ${ encodedAuthStr }`
            }
        })
        .then(res => cb(null, getContentWithAttachements(res, url)))
        .catch(err => cb(err, null))
}
