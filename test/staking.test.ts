import { contract, network } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { GovernanceStakingInstance, TestERC20Instance } from "../typechain-types";
import BN from "bn.js";

const truffleAssert = require("truffle-assertions");

chai.use(chaiAsPromised);

const TestERC20 = artifacts.require("TestERC20");
const StakingContract = artifacts.require("GovernanceStaking");

const ten = new BN("10");
const tenPow18 = ten.pow(new BN("18"));

enum Option {
  DAYS_30 = 0,
  DAYS_60 = 1,
  DAYS_90 = 2,
}

enum Constants {
  REWARD_FOR_30 = 6, // 6% reward for 30 days lock
  STAKED_FOR_30 = 2_592_000, // 30 days
  REWARD_FOR_60 = 15, // 15% reward for 60 days lock
  STAKED_FOR_60 = 5_184_000, // 60 days
  REWARD_FOR_90 = 33, // 33% reward for 90 days lock
  STAKED_FOR_90 = 7_776_000, // 90 days
}

contract("Staking", (accounts) => {
  const [deployer, user1, user2] = accounts;
  let rewardToken: TestERC20Instance;
  let stakingToken1: TestERC20Instance;
  let stakingToken2: TestERC20Instance;
  let staking: GovernanceStakingInstance;

  beforeEach("Deploy contracts", async () => {
    rewardToken = await TestERC20.new({ from: deployer });
    stakingToken1 = await TestERC20.new({ from: deployer });
    stakingToken2 = await TestERC20.new({ from: deployer });
    staking = await StakingContract.new(rewardToken.address, { from: deployer });
  });

  beforeEach("Mint reward token to deployer addresses", async () => {
    const amount = new BN(1_000_000_000).mul(tenPow18);
    await rewardToken.mint(amount);
  });

  beforeEach("Mint staking tokens to user addresses", async () => {
    const amount = new BN(1_000_000).mul(tenPow18);
    await stakingToken1.mint(amount, { from: user1 });
    await stakingToken1.mint(amount, { from: user2 });
    await stakingToken2.mint(amount, { from: user1 });
    await stakingToken2.mint(amount, { from: user2 });
  });

  describe("#constants", () => {
    it("reward for 30 days value", async () => {
      const expected = new BN(Constants.REWARD_FOR_30);
      const actual = await staking.REWARD_FOR_30();

      expect(actual.eq(expected)).is.true;
    });

    it("reward for 60 days value", async () => {
      const expected = new BN(Constants.REWARD_FOR_60);
      const actual = await staking.REWARD_FOR_60();

      expect(actual.eq(expected)).is.true;
    });

    it("reward for 90 days value", async () => {
      const expected = new BN(Constants.REWARD_FOR_90);
      const actual = await staking.REWARD_FOR_90();

      expect(actual.eq(expected)).is.true;
    });

    it("staked for 30 days value", async () => {
      const expected = new BN(Constants.STAKED_FOR_30);
      const actual = await staking.STAKED_FOR_30();

      expect(actual.eq(expected)).is.true;
    });

    it("staked for 60 days value", async () => {
      const expected = new BN(Constants.STAKED_FOR_60);
      const actual = await staking.STAKED_FOR_60();

      expect(actual.eq(expected)).is.true;
    });

    it("staked for 90 days value", async () => {
      const expected = new BN(Constants.STAKED_FOR_90);
      const actual = await staking.STAKED_FOR_90();

      expect(actual.eq(expected)).is.true;
    });
  });

  describe("#initial values", () => {
    it("reward token address", async () => {
      const expected = rewardToken.address;
      const actual = await staking.rewardToken();

      expect(actual).to.equal(expected);
    });
  });

  describe("#whitelisting", () => {
    describe("#whitelistToken", () => {
      const coefficient = new BN("5");

      it("should revert if caller is not owner of contract", async () => {
        await expect(
          staking.whitelistToken(stakingToken1.address, coefficient, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Ownable: caller is not the owner");
      });

      it("should whitelist token Address", async () => {
        const tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).false;

        await staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer });

        const expectedCoefficient = coefficient;
        const expectedDecimals = await stakingToken1.decimals();

        const tokenInfo = await staking.getTokenInfo(stakingToken1.address);
        const actualCoefficient = new BN(tokenInfo.coefficient);
        const actualDecimals = new BN(tokenInfo.decimals);

        expect(actualCoefficient.eq(expectedCoefficient)).true;
        expect(actualDecimals.eq(expectedDecimals)).true;
      });

      it("should revert if trying to whitelist existing token", async () => {
        let tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).false;

        await staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer });

        tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).true;

        await expect(
          staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer })
        ).to.eventually.be.rejectedWith(Error, "Token with this address already exist");
      });
    });

    describe("#removeFromWhitelist", () => {
      it("should revert if caller is not owner of contract", async () => {
        await expect(
          staking.removeFromWhitelist(stakingToken1.address, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Ownable: caller is not the owner");
      });

      it("should revert if token is not whitelisted", async () => {
        const tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).false;

        await expect(
          staking.removeFromWhitelist(stakingToken1.address, { from: deployer })
        ).to.eventually.be.rejectedWith(Error, "Token with this address is not whitelisted");
      });

      it("should remove whitelisted token", async () => {
        const coefficient = new BN("5");
        await staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer });

        let tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).true;

        await staking.removeFromWhitelist(stakingToken1.address, { from: deployer });

        tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).false;
      });
    });

    describe("#changeCoefficient", () => {
      it("should revert if caller is not owner of contract", async () => {
        const coefficient = new BN("5");
        await expect(
          staking.changeCoefficient(stakingToken1.address, coefficient, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Ownable: caller is not the owner");
      });

      it("should revert if token is not whitelisted", async () => {
        const tokenState = await staking.isTokenWhitelisted(stakingToken1.address);
        expect(tokenState).false;

        const newCoefficient = new BN("7");

        await expect(
          staking.changeCoefficient(stakingToken1.address, newCoefficient, { from: deployer })
        ).to.eventually.be.rejectedWith(Error, "Token with this address is not whitelisted");
      });

      it("should change token coefficient", async () => {
        const coefficient = new BN("5");
        await staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer });

        const newCoefficient = new BN("7");

        await staking.changeCoefficient(stakingToken1.address, newCoefficient, { from: deployer });

        const expectedCoefficient = newCoefficient;

        const tokenInfo = await staking.getTokenInfo(stakingToken1.address);

        const actualCoefficient = new BN(tokenInfo.coefficient);

        expect(actualCoefficient.eq(expectedCoefficient)).true;
      });
    });

    describe("#feedRewardPool", () => {
      it("should transfer rewardTokens to smart contract", async () => {
        const amount = new BN("1000000000").mul(tenPow18);

        const rewardPoolBefore = await staking.rewardPool();
        const contractRewardTokenBalanceBefore = await rewardToken.balanceOf(staking.address);

        await rewardToken.approve(staking.address, amount, { from: deployer });
        await staking.feedRewardPool({ from: deployer });

        const rewardPoolAfter = await staking.rewardPool();
        const contractRewardTokenBalanceAfter = await rewardToken.balanceOf(staking.address);

        // reward pool value
        let expected = amount;
        let actual = rewardPoolAfter.sub(rewardPoolBefore);
        expect(actual.eq(expected)).true;

        // contract balance
        expected = amount;
        actual = contractRewardTokenBalanceAfter.sub(contractRewardTokenBalanceBefore);
        expect(actual.eq(expected)).true;
      });
    });

    describe("#stake", () => {
      const coefficient = new BN("5");

      let tenPowDecimals: BN;

      beforeEach("whitelist token address", async () => {
        await staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer });
      });

      beforeEach("get min and max stake by token decimals", async () => {
        tenPowDecimals = ten.pow(await stakingToken1.decimals());
      });

      it("should revert if token address is not whitelisted", async () => {
        await expect(
          staking.stake(Option.DAYS_30, stakingToken2.address, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Error: Token with this address is not whitelisted");
      });

      it("should revert if token allowance is 0", async () => {
        const allowance = await stakingToken1.allowance(user1, staking.address);
        expect(allowance.isZero()).true;

        await expect(
          staking.stake(Option.DAYS_30, stakingToken1.address, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Error: Need to increase allowance first");
      });

      it("should revert if the reward pool does not have as many reward tokens as needed", async () => {
        const amount = new BN("100").mul(tenPowDecimals);
        await stakingToken1.approve(staking.address, amount, { from: user1 });
        await expect(
          staking.stake(Option.DAYS_30, stakingToken1.address, { from: user1 })
        ).to.eventually.be.rejectedWith(
          Error,
          "Error: No enough rewards for You, shouldve thought about this before it went moon"
        );
      });

      it("should work as expected", async () => {
        // feed reward pool
        const feedAmount = new BN("1000000000").mul(tenPow18);
        await rewardToken.approve(staking.address, feedAmount, { from: deployer });
        await staking.feedRewardPool({ from: deployer });

        const stakingTokenAmount = new BN("100").mul(tenPowDecimals);
        await stakingToken1.approve(staking.address, stakingTokenAmount, { from: user1 });

        const contractToken1BalanceBefore = await stakingToken1.balanceOf(staking.address);
        const rewardsOwedBefore = await staking.rewardsOwed();
        const tokenInfoBefore = await staking.getTokenInfo(stakingToken1.address);

        const option = Option.DAYS_90;
        const reward = calculateReward(stakingTokenAmount, coefficient, option);
        await staking.stake(option, stakingToken1.address, { from: user1 });

        const contractToken1BalanceAfter = await stakingToken1.balanceOf(staking.address);
        const rewardsOwedAfter = await staking.rewardsOwed();
        const stakerInfoAfter = await staking.getStakerInfo(user1, stakingToken1.address);
        const tokenInfoAfter = await staking.getTokenInfo(stakingToken1.address);

        // contract balance
        expect(contractToken1BalanceAfter.sub(contractToken1BalanceBefore).eq(stakingTokenAmount))
          .true;

        // rewards owed
        expect(rewardsOwedAfter.sub(rewardsOwedBefore).eq(reward)).true;

        // staker info
        expect(new BN(stakerInfoAfter.amount).eq(stakingTokenAmount)).true;
        expect(new BN(stakerInfoAfter.option).eqn(option)).true;
        expect(new BN(stakerInfoAfter.stakingTime).isZero()).false;
        expect(new BN(stakerInfoAfter.coefficient).eq(coefficient)).true;

        // token info
        expect(new BN(tokenInfoAfter.tvl).sub(new BN(tokenInfoBefore.tvl)).eq(stakingTokenAmount));
        expect(
          new BN(tokenInfoAfter.allTimeStaked)
            .sub(new BN(tokenInfoBefore.allTimeStaked))
            .eq(stakingTokenAmount)
        );
      });

      it("should revert if trying to stake twice with the same token", async () => {
        // feed reward pool
        const feedAmount = new BN("1000000000").mul(tenPow18);
        await rewardToken.approve(staking.address, feedAmount, { from: deployer });
        await staking.feedRewardPool({ from: deployer });

        // approve
        const stakingTokenAmount = new BN("100").mul(tenPowDecimals);
        await stakingToken1.approve(staking.address, stakingTokenAmount, { from: user1 });

        // stake
        const option = Option.DAYS_90;
        await staking.stake(option, stakingToken1.address, { from: user1 });

        // approve 2
        await stakingToken1.approve(staking.address, stakingTokenAmount, { from: user1 });

        // stake 2
        await expect(
          staking.stake(option, stakingToken1.address, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Error: Only one staking per token per address!!!");
      });
    });

    describe("#getStakedFor", () => {
      it("function returns right 'staked for time' by option", async () => {
        // staked for 30 days
        let expected = new BN(Constants.STAKED_FOR_30);
        let actual = await staking.getStakedFor(Option.DAYS_30);
        expect(actual.eq(expected)).true;

        // staked for 60 days
        expected = new BN(Constants.STAKED_FOR_60);
        actual = await staking.getStakedFor(Option.DAYS_60);
        expect(actual.eq(expected)).true;

        // staked for 90 days
        expected = new BN(Constants.STAKED_FOR_90);
        actual = await staking.getStakedFor(Option.DAYS_90);
        expect(actual.eq(expected)).true;
      });
    });

    describe("#claimRewards", () => {
      let tenPowDecimals: BN;
      const coefficient = new BN("5");
      const option = Option.DAYS_90;

      beforeEach("whitelist token address", async () => {
        await staking.whitelistToken(stakingToken1.address, coefficient, { from: deployer });
      });

      beforeEach("get token decimals", async () => {
        tenPowDecimals = ten.pow(await stakingToken1.decimals());
      });

      beforeEach("stake tokens to contract", async () => {
        // feed reward pool
        const feedAmount = new BN("1000000000").mul(tenPow18);
        await rewardToken.approve(staking.address, feedAmount, { from: deployer });
        await staking.feedRewardPool({ from: deployer });

        // approve
        const stakingTokenAmount = new BN("100").mul(tenPowDecimals);
        await stakingToken1.approve(staking.address, stakingTokenAmount, { from: user1 });

        // stake
        await staking.stake(option, stakingToken1.address, { from: user1 });
      });

      it("should revert if you are not staked yet", async () => {
        await expect(
          staking.claimRewards(stakingToken1.address, { from: user2 })
        ).to.eventually.be.rejectedWith(Error, "Error: You are not staked yet for this token");
      });

      it("should revert if staking time is not passed", async () => {
        await expect(
          staking.claimRewards(stakingToken1.address, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Error: Too soon to unstake");
      });

      it("should work as expected", async () => {
        // increase time
        await increaseTime(getStakedFor(option));

        const contractRewardTokenBalanceBefore = await rewardToken.balanceOf(staking.address);
        const contractToken1BalanceBefore = await stakingToken1.balanceOf(staking.address);
        const tokenInfoBefore = await staking.getTokenInfo(stakingToken1.address);
        const rewardsOwedBefore = await staking.rewardsOwed();
        const rewardPoolBefore = await staking.rewardPool();
        const stakerInfoBefore = await staking.getStakerInfo(user1, stakingToken1.address);

        const reward = calculateReward(
          new BN(stakerInfoBefore.amount),
          new BN(stakerInfoBefore.coefficient),
          getOptionByNumber(new BN(stakerInfoBefore.option).toNumber())
        );
        const result = await staking.claimRewards(stakingToken1.address, { from: user1 });

        const contractRewardTokenBalanceAfter = await rewardToken.balanceOf(staking.address);
        const contractToken1BalanceAfter = await stakingToken1.balanceOf(staking.address);
        const tokenInfoAfter = await staking.getTokenInfo(stakingToken1.address);
        const rewardsOwedAfter = await staking.rewardsOwed();
        const rewardPoolAfter = await staking.rewardPool();
        const stakerInfoAfter = await staking.getStakerInfo(user1, stakingToken1.address);

        expect(
          new BN(tokenInfoBefore.tvl)
            .sub(new BN(tokenInfoAfter.tvl))
            .eq(new BN(stakerInfoBefore.amount))
        ).true;
        expect(rewardsOwedBefore.sub(rewardsOwedAfter).eq(reward)).true;
        expect(rewardPoolBefore.sub(rewardPoolAfter).eq(reward)).true;
        expect(stakerInfoAfter.rewardTaken).true;
        expect(contractRewardTokenBalanceBefore.sub(contractRewardTokenBalanceAfter).eq(reward))
          .true;
        expect(
          contractToken1BalanceBefore
            .sub(contractToken1BalanceAfter)
            .eq(new BN(stakerInfoBefore.amount))
        ).true;

        truffleAssert.eventEmitted(result, "WithdrawHappened");
      });

      it("should revert if reward already was taken", async () => {
        // increase time
        await increaseTime(getStakedFor(option));

        await staking.claimRewards(stakingToken1.address, { from: user1 });
        await expect(
          staking.claimRewards(stakingToken1.address, { from: user1 })
        ).to.eventually.be.rejectedWith(Error, "Error: You already took the reward");
      });
    });
  });

  const calculateReward = (amount: BN, coefficient: BN, option: Option) => {
    let reward = new BN(0);

    if (option === Option.DAYS_30) reward = new BN(Constants.REWARD_FOR_30);
    if (option === Option.DAYS_60) reward = new BN(Constants.REWARD_FOR_60);
    if (option === Option.DAYS_90) reward = new BN(Constants.REWARD_FOR_90);

    return amount.mul(reward).mul(coefficient).divn(100);
  };

  const getStakedFor = (option: Option) => {
    switch (option) {
      case Option.DAYS_30:
        return Constants.STAKED_FOR_30;
      case Option.DAYS_60:
        return Constants.STAKED_FOR_60;
      case Option.DAYS_90:
        return Constants.STAKED_FOR_90;
    }
  };

  const increaseTime = async (seconds: number): Promise<void> => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  };

  const getOptionByNumber = (num: number) => {
    if (num === 0) return Option.DAYS_30;
    if (num === 1) return Option.DAYS_60;
    if (num === 2) return Option.DAYS_90;
    throw new Error("invalid number");
  };
});
