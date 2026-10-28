export async function loadProjects(token: string, teamId?: string){
    //flow:
    //fetch my project
    //fetch analytics for a selected project with requests
    //wire the results in Tauri ( not here)
    const baseURL = new URL("https://api.vercel.com/v10/projects");
    const headers = {"Authorization": `Bearer ${token}`};

    if(teamId){
         baseURL.searchParams.append('teamId', teamId);
    }

    const response = await fetch(baseURL.toString(), {

            method: 'GET',
            headers: headers,
    });

    if(!response.ok){
        throw new Error(`Could not retrieve Vercel projects!`);
    }

    const resJSON = await response.json();
    return resJSON.projects;
}
