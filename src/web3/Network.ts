import {Collection, Model} from "sunshine-dao/lib/Model";


@Collection("networks")
export class Network extends Model{

    name: string;
    id: string;
    rpo: string;
    testnet: boolean;
    nativeCurrency: [];

}
