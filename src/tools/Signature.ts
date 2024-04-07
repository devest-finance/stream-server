import Web3 from "web3";

export class Signature {

    verify(signature: string, address: string){
        const message = this.createMessage(address);

        const web3 = new Web3();
        const signingAddress = web3.eth.accounts.recover(message, signature);

        return address == signingAddress;
    }

    sign(){}

    createMessage(address: string): string{
        return "Welcome to DeVest\n" +
            "Click to sign-in and accept the DeVest Terms of Service: https://devest.finance/tos\n" +
            "This request will not trigger a blockchain transaction or cost any gas fees.\n" +
            "Your authentication status will reset after 24 hours.\n" +
            "Wallet address:\n" + address;
    }

}
