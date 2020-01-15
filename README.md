# Senti Gateway
Senti Gateway Service is a Microgateway for the Senti Microservices architecture.

The Microgateway is a gateway for enforcing access to Microservices & APIs. It supports the following core features: 

- Secure and control access to APIs
- Collection of pre-built gateway policies for API Key validation, authentication, and rate limiting and versioning 
- Create gateway policies (security, routing, integration, etc.)

The role of the Senti Microgateway is to protect, enrich and control access to Senti Microservices API services. This includes security and rate limiting, but it also includes the ability to do message inspection. The Gateway insures that the message received is properly formed JSON. In addition, the Gateway can modify the payload or transform it to meet old or new interfaces for the API backend. Finally, the Gateway can invoke multiple services and aggregate responses from multiple API backends.

Core features 2:
- Multi routes/paths
- Invoke multiple services / aggregate responses
- Policy
- API key validation
- Authentication
- Rate limiting
- Versioning
- Message inspection
- Check JSON
- Modify/transfor payload