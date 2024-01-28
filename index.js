

const PKG = {
    
    // Auth token used to communicate with the limit-handler api
    LH_AUTH_TOKEN: null,
    
    // Literal instance of request library
    REQUEST_UTILITY: null,

    // Name of request library (i.e. 'axios')
    REQUEST_UTILITY_LIB_NAME: null,

    // Refresh token which will be used to re-authenticate with the limit-handler API
    REFRESH_TOKEN: null,

    // Identifier string for user's organization, necessary for authentication
    ORG_IDENTIFIER: null,

    /**
     * @description Given request utility,
     * give back a string representing the name of the request utility
     * @param requestUtility - Instance of an http request library, only Axiofs supported
     */
    // setRequestLibName: function (){
    setRequestLib: function (requestUtility){
        this.REQUEST_UTILITY = requestUtility;

        const isAxios = Boolean(requestUtility.Axios);
        if(isAxios){
            this.REQUEST_UTILITY_LIB_NAME = "axios";
        }else{
            throw new Error("Unsupported request utility - currently only [ Axios ] are supported");
        }

        
    },
    
    /**
     * @description Main function called, attaches interceptors to the request library
     * which reach out to the limit-handler backend server and figure out the proper wait time for a request.
     * @param requestUtility - Instance of an http request library, only Axios supported right now
     */
    configure: async function(requestUtility, userConfig){
        const { account } = userConfig;

        this.REFRESH_TOKEN = account.refreshToken;
        this.ORG_IDENTIFIER = account.orgidentifier;
        
        this.setRequestLib(requestUtility);

        if(this.REQUEST_UTILITY_LIB_NAME === "axios"){
            this.configureAxios(userConfig);
        }else{
            throw new Error("Unsupported request utility - currently only [ Axios ] are supported");
        }

        this.REQUEST_UTILITY = requestUtility;
    },

    /**
     * @description Add proper interceptors to axios
     */
    configureAxios: async function (userConfig){
        const pkgScope = this;
        this.REQUEST_UTILITY.interceptors.request.use(

            async function(config){

                for(const project of userConfig.projects){
                    if(config.url.includes(project.url)){
                        const waitTime = await pkgScope.getWaitTime({
                            projectIdentifier: project.projectIdentifier,
                            orgidentifier: userConfig.account.orgidentifier
                        });
                        if(waitTime > 0) await new Promise(r => setTimeout(r, waitTime));
                    }
                }

                return config;
            }

        );

    },


    /**
     * @description Hit limit handler API and figure out how long user should have to wait
     * before making another request to the url designated for this project.
     */
    getWaitTime: async function (projectConfiguration){
        if(!this.LH_AUTH_TOKEN) await this.reauthenticate();

        let attempts = 0;
        let waitTime = 0;
        let success = false;
        while(attempts <= 3){
            const { projectIdentifier, orgidentifier } = projectConfiguration;

            const {
                responseData,
                responseStatus
            } = await this.makeRequest({
                    method: "POST",
                    url: `${process.env.LIMIT_HANDLER_API_URL}/requests`,
                    data: { projectIdentifier, requestTimestamp: Date.now() },
                    headers: { orgidentifier, authtoken: this.LH_AUTH_TOKEN }
            });

            if(responseStatus === 200){
                waitTime = responseData.data.waitTime;
                success = true;
                break;
            }else if(responseStatus === 401){
                await this.reauthenticate();
                attempts += 1;
            }
        }

        console.log(`In response interceptor - Sleeping for ${waitTime} - success: ${success}`);
        return waitTime;
    },

    /**
     * @description If the auth token being sent to the limit-handler API is invalid,
     * retrieve a new one with this function.
     */
    reauthenticate: async function (){
        const response = await this.makeRequest({
                method: "POST",
                url: `${process.env.LIMIT_HANDLER_API_URL}/tokens`,
                data: { refreshToken: this.REFRESH_TOKEN, orgIdentifier: this.ORG_IDENTIFIER },
                headers: { "Content-Type": "application/json" }
        });
        const { responseData, responseStatus } = response;

        this.LH_AUTH_TOKEN = responseData.data.authToken;
        console.log("reauthed", this.LH_AUTH_TOKEN);
        
    },


    makeRequest: async function (requestConfig) {
        if(this.REQUEST_UTILITY_LIB_NAME === "axios"){
            const r = await this.makeRequestAxios(requestConfig);
            return r;
        }else{
            throw new Error("Unsupported request utility - currently only [ Axios ] are supported");
        }
    },


    makeRequestAxios: async function (requestConfig){
        const { url, method, headers, data } = requestConfig;
        const resp = await this.REQUEST_UTILITY({ method, url, data, headers });

        return {
            responseStatus: resp.status,
            responseData: resp.data
        }
    }


}


module.exports = PKG;