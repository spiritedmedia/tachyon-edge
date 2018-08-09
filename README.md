Tachyon@Edge is a fork of [Tachyon](https://engineering.hmn.md/projects/tachyon/) and built with some strong opinions and assumptions:

- Runs on Amazon Web Services (using CloudFront and Lambda@Edge.)
- Expects original image files to be stored on Amazon S3.

Tachyon works best with WordPress, coupled with [S3 Uploads](github.com/humanmade/s3-uploads) and the [Tachyon Plugin](https://github.com/humanmade/tachyon-plugin).

![](screenshot.png)

---

## Using

Tachyon provides a simple HTTP interface in the form of:

`https://{tachyon-domain}/my/image/path/on/s3.png?w=100&h=80`

It's really that simple!

Requests that aren't images (gif, jpg, png, webp) get passed through to the S3 bucket for CloudFront to serve as is. Images can be processed via query strings.

#### Args Reference

| URL Arg | Type | Description |
|---|----|---|
|`w`|Number|Max width of the image.|
|`h`|Number|Max height of the image.|
|`resize` `fit`|String, "w,h"|Resize and crop an image to exact width,height pixel dimensions.|
|`quality`|Number, 0-100|Image quality (JPG and WEBP only).|
|`crop`|String, "x,y,w,h"|Crop an image by percentages x-offset,y-offset,width,height (x,y,w,h). Percentages are used so that you don’t need to recalculate the cropping when transforming the image in other ways such as resizing it. `crop=160px,160px,788px,788px` takes a 788 by 788 square starting at 160 by 160.|
|`webp`|Boolean, 1|Force WebP format.|
|`lb`|String, "w,h"|Add letterboxing effect to images, by scaling them to width, height while maintaining the aspect ratio and filling the rest with black or `background`.|
|`background`|String|Add background color via name (red) or hex value (%23ff0000). Don't forget to escape # as `%23`.|
|`negative`|Boolean, 1|Reverse the colors of the image.|
|`flip`|Boolean, 1|Flip the image vertically.|
|`flop`|Boolean, 1|Flip the image horizontally.|
|`rotate`|0, 90, 180, 270| Rotate the image a certain number of degrees.|
|`grayscale` `greyscale`| Boolean, 1|Convert the image to grayscale|

For more details checkout the [docs](https://engineering.hmn.md/projects/tachyon/).

## How Does It Work?
 - A request comes to CloudFront
 - A Lambda@Edge function intercepts the request form CloudFront to the origin server (Amazon S3 bucket)
 - The Lambda function handles resizing images (files that end with .jpg, .gif, .png, or .webp) and saving them to a directory in the S3 bucket (`/resized/`)
 - The request to the origin is modified allowing CloudFront to serve the processed image

## Differences from Tachyon
 - By using Lambda@Edge functions we can manipulate a request to the origin server rather than handling the serving of the image within the Lambda function itslef
 - API Gateway has limits with the size of responses causing internal server errors for larger files
 - Can handle requests for any kind of file, not just images
 - Non-image requests are passed through to the S3 bucket
 - No need to use the API Gateway service which saves money
 - Added a few more options for manipulating images (`rotate`, `grayscale`, `negative`)

 ## Installing

 ### Configuration
  - Download a zip of the [latest release](https://github.com/spiritedmedia/tachyon-edge/releases)
  - Unzip it, edit `config.json` with your own region and bucket values
  - Zip the folder back up and upload it to an S3 bucket

 ### Permissions
  - In [AWS IAM](https://console.aws.amazon.com/iam/home) create a new role for your Lambda function
  - Attach the `CloudWatchLogsFullAccess`, `AWSLambdaExecute`, and `CloudFrontReadOnlyAccess` policies to the role
  - Attach a policy granting access to your bucket containing the media

 ### AWS Lambda Function
  - Create a [new Lambda function](https://console.aws.amazon.com/lambda/home)
  - Set the runtime value to `Node.js 6.10`
  - Associate the existing role you created in the previous steps to your Lambda function
  - In the Function Code panel, select `Upload a File from Amazon S3`
  - Paste a link to the zip file you uploaded to S3 in the previous steps into the `S3 link URL` field
  - Change the Handler field value to `lambda-handler.handler`
  - Under the Basic Settings panel I set Memory (MB) to `256 MB` and timeout to `30 sec`
  - At the top of the page click on the Actions dropdown and select `Publish New Version`
  - Give your new version a Description
  - Copy the ARN value in the upper right of the function page (it looks like `arn:aws:lambda:us-east-1:000000000000:function:your-function-name`), you will need it later

 ### CloudFront
  - Create a new CloudFront distribution (Web delivery method, not RTMP)
  - Select the Amazon S3 bucket holding your media as the Origin Domain Name
  - For Default Cache Behavior Settings enter the following:
     - Viewer Protocol Policy: `Redirect HTTP to HTTPS`
     - Allowed HTTP Methods: `GET, HEAD`
     - Forward Cookies: `None (Improves Caching)`
     - Query String Forwarding and Caching: `Forward all, cache based on all`
     - Smooth Streaming: `No`
     - Restrict Viewer Access (Use Signed URLs or Signed Cookies): `No`
     - Lambda Function Associations Event Type: `Origin Request`
     - Lambda Function ARN: Paste the ARN value you copied earlier \*
  - For Distribution Settings
     - Price Class: Whatever makes sense for your audience
     - AWS WAF Web ACL: `None`
     - Alternate Domain Names (CNAMEs): Enter any alternate domain names you want to map on to CloudFront (one per line)
     - SSL Certificate: `Default CloudFront Certificate (*.cloudfront.net)`
     - Supported HTTP Versions: `HTTP/2, HTTP/1.1, HTTP/1.0`
     - Distribution State: `Enabled`
  - Click the blue `Create Distribution` button and wait
  - Test it out and request a URL with query strings like `?w=100&h=80` appended


 \* You need to add the version number of the Lambda function to the end of the ARN like `arn:aws:lambda:us-east-1:000000000000:function:your-function-name:1` for version 1 of the Lambda function. Every time you publish a new version you need to edit your CloudFront distribution and change this value.

## Local Development
To work with the Tachyon@Edge locally you need to perform the following steps:

1. Make sure you have Node 6.10+ installed
2. Install `libvips` on macOS: `brew install homebrew/science/vips --with-webp --with-graphicsmagick`
3. Clone the repo: `git@github.com:spiritedmedia/tachyon-edge.git`
4. Install the node module dependencies: `npm install`
5. Populate a `local-config.json` with the AWS S3 credentials, region, and bucket name you want to use, in the following format:
```
{
   	"accessKeyId": "***",
	"secretAccessKey": "****",
	"region": "us-east-1",
	"bucket": "my-bucket-name"
}
```
6. Start the server: `node server.js [port]`
7. Visit [http://localhost:8080/]() to confirm it is working
8. Pass a path to a file in the bucket like [http://localhost:8080/test-files/grid.jpg?w=250]() which should be resized to 250px wide

### Building the Docker Image and AWS Lambda Package
A docker file is included for building the `node_modules` for the AWS Lambda function. Follow these steps:

1. Download [Docker](https://www.docker.com/) and make sure it is running
2. Run `npm run-script build-docker` to build the docker image (you only need to do this once)
3. Run `npm run-script build-node-modules` to compile the node modules for an Ubuntu Linux environment
4. Edit `config.json` to specify which S3 bucket you want the Lambda function to use  
5. Run `npm run-script build-zip` to build a zip file called `lambda.zip`
6. Upload `lambda.zip` to a bucket on S3
7. Update the lambda function via an S3 URL like [https://s3.amazonaws.com/my-bucket-name/lambda.zip]()

## Credits
Props to [Human Made](https://humanmade.com/) for the original [Tachyon project](https://engineering.hmn.md/projects/tachyon/) written and maintained by [Joe Hoyle](https://github.com/joehoyle).

Tachyon is inspired by Photon by Automattic. As Tachyon is not an all-purpose image resizer, rather it uses a media library in Amazon S3, it has a different use case to [Photon](https://jetpack.com/support/photon/).

Tachyon uses the [Sharp](https://github.com/lovell/sharp) (Used under the license Apache License 2.0) Node.js library for the resizing operations, which in turn uses the great libvips library.
