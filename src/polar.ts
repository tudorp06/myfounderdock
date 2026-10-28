import process from 'node:process';

interface PolarOrder{
    id: string;
    created_at: string;
    total_amount: number;
    product: {
        id: string;
        name: string;
    }
    customer: {
        name: string | null;
        email: string;
    }
    currency: string;
    paid: boolean;

}

//we will be getting more orders on a page, as a list


interface PolarOrdersResponse{
    items: PolarOrder[] ;

    pagination: {
        total_count: number;
        max_page: number;
    }
}


export async function fetchSalesStats(token: string, productId?: string): Promise<PolarOrder[] | null> {
    const url = new URL(`https://api.polar.sh/v1/orders/`);
    url.searchParams.append('limit', '100');
    if(productId){
        url.searchParams.append('product_id', productId);
    }
    url.searchParams.append(`sorting`, '-created_at');

    try{
        const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/json'
            },
        });

        if(!response.ok){
            throw new Error(`Polar API Error: ${response.status} ${response.statusText}`);
        }

        const data: PolarOrdersResponse = await response.json()
        const first_order = data.items[0];
        console.log("Number of orders: ", data.items?.length)
        console.log(`First order details: name: ${first_order.product.name}, total_amount: ${(first_order.total_amount)/100}, currency: ${first_order.currency}, status: ${first_order.paid} `)
        return data.items;

    } catch(err){
        console.error(`Couldn't fetch Polar orders!`, err);
        return null;
    }


}

const token = process.env.POLAR_ACCESS_TOKEN;

if(!token){
    throw new Error("POLAR_ACCESS_TOKEN is missing");
}

const orders = await fetchSalesStats(token);
const paidOrders = orders?.filter((item) => item.paid===true);

for(const order of paidOrders ?? []){
    console.log(order.product.name, order.total_amount);
}
