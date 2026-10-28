
export interface TrustMRRSettings{
    startupSlug: string;
    amountUnit?: 'usd' | 'cents';
}

export interface TrustMRRRevenue{
    last30Days: number;
    mrr: number;
    total: number;
}

export interface TrustMRRStartup{
    name: string;
    slug: string;
    icon: string | null;
    website?: string | null;
    revenue: TrustMRRRevenue;
    customers?: number | null;
    activeSubscriptions?: number | null;
    growth30d?: number | null;

}

const key = 'myfounderdock-TrustMRR';

//trust mrr api: https://trustmrr.com/api/v1/{startupSlug}

export function saveTrustMRRSettings(settings: TrustMRRSettings): void{
    const strSettings = JSON.stringify(settings);
    localStorage.setItem(key, strSettings);
}

export function readTrustMRRSettings(): TrustMRRSettings{
    const settings = localStorage.getItem(key);
    if(!settings){
        return {startupSlug: ''};
    }
    try{
    const parsed = JSON.parse(settings);
    return {startupSlug: typeof parsed?.startupSlug === 'string' ? parsed.startupSlug : '', amountUnit: parsed?.amountUnit === 'cents' ? 'cents' : 'usd'};
    } catch(err){
        console.log(`Encountered an error when parsing: ${err}`);
        return {startupSlug: ''};
    }
}

export async function fetchTrustMRR(token: string, startupSlug: string): Promise<TrustMRRStartup>{
    const url = new URL(`https://trustmrr.com/api/v1/startups/${encodeURIComponent(startupSlug)}`);
    const headers = {"Authorization": `Bearer ${token}`};
    const response = await fetch(url.toString(), {
        headers : headers,
    })

    if(!response.ok){
        throw new Error(`TrustMRR API error: ${response.status}`);
    }

    const resJSON = await response.json();

    return resJSON.data;
}
