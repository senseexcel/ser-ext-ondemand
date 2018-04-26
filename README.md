# SER on demand extension

[![TravisCI](https://travis-ci.org/senseexcel/ser-ext-ondemand.svg?branch=master)](https://travis-ci.org/senseexcel/ser-ext-ondemand)
[![Downloads](https://m.sense2go.net/downloads.svg?q2g-ext-selector)](https://m.sense2go.net/extension-package)

This extension was developed enable the Sense Excel Repoting users to create reports on demand. 

## Settings

### Configuration

Configurations  |  Description
----------------|--------------------------------------------
choose library  | select the library you want to choose your excel template from
choose content  | select the excel template you want to use for the report
output format   | select the type of the output file
Selection Mode  | select the way you want to use for your selections
Direct Download | choose if you want to download the report manualy, or start automatically

#### Selection Mode

Options                         |  Description
--------------------------------|--------------------------------------------
Selection over shared session   | the session between you browser and the reporting engine will be shared, this means, that you can see the actions of the reporting tool
Selection over bookmark         | the session between you browser and the reporting engine will not be shared. The selections you made will be send the the engine via a bookmark
not use                         | only the default configuration from the template will be used

## Install

### binary

1. [Download the ZIP](https://m.sense2go.net/extension-package) and unzip
2. Qlik Sense Desktop
   Copy it to: %homeptah%\Documents\Qlik\Sense\Extensions and unzip
3. Qlik Sense Entripse
   Import in the QMC

### source

1. Clone the Github Repo into extension directory
2. Install [nodejs](https://nodejs.org/)
3. Open Node.js command prompt
4. navigate to the src folder
4. npm install
5. npm run build:dev