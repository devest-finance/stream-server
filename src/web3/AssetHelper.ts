import {Network} from "./Network";
import Web3 from "web3";

export class AssetHelper {

    async getBalance(network, assetAddress, ownerAddress) {
        const contract = await this.getContract(network, assetAddress);
        const balance = await contract.methods.balanceOf(ownerAddress).call();
        return parseInt(balance);
    }

    protected async getContract(network, address): Promise<any> {
        const abi = require('./contracts/dvasset.json');
        const web3 = await this.getWeb3(network);
        return new web3.eth.Contract(abi, address)
    }

    protected async getWeb3(chainId: string): Promise<Web3> {
        const network = await Network.findOne<Network>({ id: chainId }, { projection: { rpc: 1 } });
        // @ts-ignore
        const provider = new Web3.providers.HttpProvider(network.rpc);
        return new Web3(provider);
    }

}
