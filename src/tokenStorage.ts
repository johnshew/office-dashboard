import * as Utitlities from './utilities';

export default class TokenLocalStorage implements Kurve.TokenStorage {
    private storageKey = 'kurve-identity-token-store';
    private tokens: Kurve.TokenDictionary;

    constructor() {
        this.tokens = this.getStoredTokens();
    }

    public add(key, token) {
        this.tokens[key] = token;
        this.save();
    }

    public remove(key) {
        delete this.tokens[key];
        this.save();
    }

    public getAll() {
        var tokensArray = [];
        for (var key in this.tokens) {
            tokensArray.push(this.tokens[key]);
        }
        return tokensArray;
    }

    public clear() {
        Utitlities.Storage.removeItem(this.storageKey);
    }

    public hasTokens() {
        return Object.keys(this.tokens).length > 0;
    }

    private getStoredTokens() {
        return Utitlities.Storage.getItem(this.storageKey) || {};
    }

    private save() {
        Utitlities.Storage.setItem(this.storageKey, this.tokens);
    }
}
