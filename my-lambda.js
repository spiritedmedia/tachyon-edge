const AWS = require('aws-sdk');
const S3 = new AWS.S3({
  signatureVersion: 'v4',
});

// These need to be hardcoded because Lambda@Edge doesn't support environment variables
const REGION = 'us-east-1';
const BUCKET = 'spiritedmedia-com';

exports.handler = (event, context, callback) => {
    function bail() {
        callback(null, request);
    }

    function queryStringToJSON( queryString ) {
        const pairs = queryString.split('&');
        let result = {};
        pairs.forEach(function(pair) {
            pair = pair.split('=');
            result[ pair[0] ] = decodeURIComponent( pair[1] || '' );
        });
        let sortedResult = {}
        Object.keys( result ).sort().forEach(function(key) {
            sortedResult[key] = result[key];
        });
        return JSON.parse( JSON.stringify( result ) );
    }

    function JSONToQueryString( obj ) {
        return Object
            .keys(obj)
            .reduce( function( a, k ) {
                a.push( k + '=' + encodeURIComponent( obj[k] ) );
                return a;
            },[])
            .join('&');
    }

    function getIntersectingValues( array1, array2 ) {
        return array1
                .filter( function( val ) {
                    return array2.indexOf( val ) !== -1;
                })
                // Remove duplicates
                .filter( function( el, index, arr ) {
                    return arr.indexOf( el ) === index;
                });
    }

    let request = event.Records[0].cf.request;
    console.log( 'The event!!!' );
    console.log( JSON.stringify( event ) );

    // Turn the request query string into an object
    let queryString = queryStringToJSON( request.querystring );
    // Update request querystring with normalized query strings
    request.querystring = JSONToQueryString( queryString );

    const requestURL = request.uri;
    const requestExtension = request.uri.split('.').pop();
    const allowedExtensions = [ 'jpg', 'jpeg', 'png', 'webp', 'gif' ];
    if ( allowedExtensions.indexOf( requestExtension ) === -1 ) {
        return bail();
    }

    const allowedQueryStrings = [ 'w', 'h', 'resize', 'quality', 'crop', 'webp', 'lb', 'background' ];
    let matchingKeys = getIntersectingValues( Object.keys( queryString ), allowedQueryStrings );
    if ( matchingKeys.length === 0 ) {
        return bail();
    }

    function sanitizeQueryString( str ) {
        str = decodeURIComponent( str );
        return encodeURIComponent( str.replace(/[=,&|]/g,'-' ) );
    }

	function putObject(data) {
	    queryString = JSONToQueryString( queryString );
	    let newKey = 'resized/' + key;
	    if ( queryString ) {

	        newKey += '_' + sanitizeQueryString( queryString );
	    }
	    S3.putObject({
	            ACL: 'public-read',
                Body: data.Body,
                Bucket: BUCKET,
                ContentType: data.ContentType,
                Key: newKey,
            },
            function( err, data ) {
                if ( err ) {
                    console.log( 'ERROR PUTTING OBJECT:', err );
                    return bail();
                }
                request.uri = '/' + newKey;
                request.querystring = '';
                console.log( 'RESULT!!!' );
                console.log( JSON.stringify( request ) );
                return callback(null, request);
            });
	}

	let key = requestURL.replace(/^\/+/g, '');
    S3
        .getObject({
            Bucket: BUCKET,
            Key: key
        })
        .promise()
        .then( putObject )
        .catch(function() {
            bail();
        });
};
