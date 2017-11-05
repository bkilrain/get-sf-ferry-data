# Get Bay Ferry Data
Lambda function to automatically get, massage and save to DynamoDB all ferry times for San Francisco Bay Ferry. This function currently automates keeping [The Bay Ferry](https://www.amazon.com/Brian-Kilrain-The-Bay-Ferry/dp/B071KBG28X) Alexa skill updated with the latest schedules. It is published here according to the [AWS Serverless Application Model (SAM)](https://github.com/awslabs/serverless-application-model) spec.

## How To Use
Prior to deployment, update the template.yaml file with your 511.org API token and DynamoDB table. 

You could also alter the code to call any RESTful API(s) and save the data to DynamoDB to reference at a later time. This is useful if the API requires calls to multiple endpoints or returns data that needs heavy parsing.