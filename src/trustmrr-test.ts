import {fetchTrustMRR} from './trustmrr.ts';

const token = process.env.TRUSTMRR_API_KEY;

if(!token){
    throw new Error(`TRUSTMRR_API_KEY is missing!`);
}

const startupInfo = await fetchTrustMRR(token, "BuildNotch");
console.log(startupInfo.revenue);
