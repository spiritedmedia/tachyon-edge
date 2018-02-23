# Files for Testing Tachyon@Edge

This directory contains various types of files that come in handy for testing. Upload this directory to an S3 bucket and run the local server to see if everything works.

# Things to Look Out For
 - `animated.gif` should not be processed as we can't resize or manipulate animated gifs. The original URL will be returned regardless of the query string.
 - `static.gif` should be able to be resized and processed like any other image.
 - The content type of `static.gif` returned from the server should be `image/png` which is more efficent than `image/gif`.
 - `a.pdf` should not be processed because it does not have an image file extension.
 - `bw.jpg` and `grid.jpg` should be able to be processed just fine.
 - Setting the `quality` query string will only work on jpg files.