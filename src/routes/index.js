'use strict'

const yaml = require('yaml');
const node_fetch = require('node-fetch');

module.exports = async function (fastify, opts) {

  /**
   * Receives a payload containing a Salesforce Account ID, retrieves a yaml file of transactions from an external system
   * and writes transactions belonging to the account back to the calling salesforce org
   */
  fastify.post('/parse-transactions', async function (request, reply) {
    const {event, context, logger} = request.sdk;
    const org = context.org;
    const dataApi = context.org.dataApi;

    logger.info(`POST /parse-transactions ${JSON.stringify(event.data || {})}`);

    const validateField = (field, value) => {
      if (!value) throw new Error(`Please provide ${field}`);
    }

    // Validate Input
    const data = event.data;
    validateField('accountId', data.accountId);

    // Parse YAML
    const yamlText = await node_fetch.default('https://raw.githubusercontent.com/markusneubrand-sf/transation-data/refs/heads/main/transactions-sample.yaml')
                          .then((response) => response.text());
    const parsed = yaml.parse(yamlText);

    // Create a unit of work that inserts transactions belonging to the account
    const uow = dataApi.newUnitOfWork();
    for (var i = 0; i < parsed.length; i++) {
      if (parsed[i].accountId == data.accountId) {
        logger.info(JSON.stringify(parsed[i]));
        uow.registerCreate({
          type: 'Transaction__c',
          fields: {
            Account__c: parsed[i].accountId,
            Name: parsed[i].subject,
            Amount: parsed[i].amount
          }
        });
      }
    }

    // Commit the Unit of Work with all the previous registered operations
    try {
      const response = await dataApi.commitUnitOfWork(uow);
      logger.info(JSON.stringify(response));
    } catch (err) {
      const errorMessage = `Failed to insert record. Root Cause : ${err.message}`;
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return '{message: "Success"}';
  });
  
}
