'use strict';

/**
 * Tiny multipart/form-data body parser. Handles the one case this app needs:
 * a form with a handful of text fields plus at most one file field. Not a
 * general-purpose replacement for a library like `multer` - just enough to
 * keep this project dependency-free.
 */
function parseMultipart(buffer, contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) throw new Error('No multipart boundary found');
  const boundary = '--' + (match[1] || match[2]).trim();
  const boundaryBuf = Buffer.from(boundary, 'utf8');

  const fields = {};
  const files = {};

  let start = buffer.indexOf(boundaryBuf);
  while (start !== -1) {
    const nextBoundary = buffer.indexOf(boundaryBuf, start + boundaryBuf.length);
    if (nextBoundary === -1) break;
    // Part content sits between end of this boundary line and start of the next boundary,
    // minus the trailing CRLF that precedes the next boundary marker.
    let partStart = start + boundaryBuf.length;
    if (buffer.slice(partStart, partStart + 2).toString() === '--') break; // final boundary
    if (buffer.slice(partStart, partStart + 2).toString() === '\r\n') partStart += 2;

    const headerEnd = buffer.indexOf('\r\n\r\n', partStart);
    if (headerEnd === -1) break;
    const headerText = buffer.slice(partStart, headerEnd).toString('utf8');
    let content = buffer.slice(headerEnd + 4, nextBoundary);
    // Strip the trailing CRLF right before the next boundary.
    if (content.slice(-2).toString() === '\r\n') content = content.slice(0, -2);

    const nameMatch = /name="([^"]+)"/i.exec(headerText);
    const filenameMatch = /filename="([^"]*)"/i.exec(headerText);
    const typeMatch = /Content-Type:\s*([^\r\n]+)/i.exec(headerText);

    if (nameMatch) {
      const fieldName = nameMatch[1];
      if (filenameMatch && filenameMatch[1]) {
        files[fieldName] = {
          filename: filenameMatch[1],
          contentType: typeMatch ? typeMatch[1].trim() : 'application/octet-stream',
          data: content
        };
      } else {
        fields[fieldName] = content.toString('utf8');
      }
    }

    start = nextBoundary;
  }

  return { fields, files };
}

module.exports = { parseMultipart };
