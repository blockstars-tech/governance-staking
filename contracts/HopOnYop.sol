// SPDX-License-Identifier: MIT

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

//////////DEFI product for staking Your YOP tokens and getting rewards
//Version 1.3

//THE smart contract for staking RAMP tokens and claiming the rewards
//Fully fair and simple. Enjoy ;)
pragma solidity ^0.8.10;

contract HopOnYop {
  IERC20 public YOP;

  uint256 public RewardPool;
  uint256 public AllTimeStaked;
  uint256 public TVL;
  uint256 public RewardsOwed;
  uint256 private constant minStake = 88 * (10**8);
  uint256 private constant maxStake = 33333 * (10**8);
  uint8 public constant reward1 = 6;
  uint256 public constant stakedFor1 = 30 days; //6% reward for 30 days lock
  uint8 public constant reward2 = 15;
  uint256 public constant stakedFor2 = 60 days; //15% reward for 60 days lock
  uint8 public constant reward3 = 33;
  uint256 public constant stakedFor3 = 90 days; //33% reward for 90 days lock

  constructor(address addr) {
    YOP = IERC20(addr);
  }

  enum options {
    d30,
    d60,
    d90
  }
  struct stake {
    uint256 amount;
    uint256 stakingTime;
    options option;
    bool rewardTaken;
  }

  mapping(address => stake) private stakes;

  /**
   * @dev Adds more tokens to the pool, but first we needs to add allowance for this contract
   */
  function feedRewardPool() public {
    uint256 tokenAmount = YOP.allowance(msg.sender, address(this));
    RewardPool += tokenAmount;
    require(YOP.transferFrom(msg.sender, address(this), tokenAmount)); //Transfers the tokens to smart contract
  }

  function stakeYOP(options option) public {
    require(stakes[msg.sender].stakingTime == 0, "Error: Only one staking per address!!!");
    uint256 tokenAmount = YOP.allowance(msg.sender, address(this));
    require(tokenAmount > 0, "Error: Need to increase allowance first");
    require(
      tokenAmount >= minStake && tokenAmount <= maxStake,
      "Error: You should stake from 33 to 88888 tokens."
    );
    stakes[msg.sender].amount = tokenAmount;
    stakes[msg.sender].option = option;
    stakes[msg.sender].stakingTime = block.timestamp;

    uint256 reward = calculateReward(msg.sender);
    require(
      RewardPool >= reward + RewardsOwed,
      "Error: No enough rewards for You, shouldve thought about this before it went moon"
    );

    TVL += tokenAmount;
    RewardsOwed += reward;
    AllTimeStaked += tokenAmount;
    require(YOP.transferFrom(msg.sender, address(this), tokenAmount)); //Transfers the tokens to smart contract
  }

  /**
   * @dev claims the rewards and stake for the stake, can be only called by the user
   * doesnt work if the campaign isnt finished yet
   */
  function claimRewards() public {
    require(stakes[msg.sender].rewardTaken == false, "Error: You already took the reward");
    uint256 stakedFor;
    options option = stakes[msg.sender].option;

    if (option == options.d30) stakedFor = stakedFor1;

    if (option == options.d60) stakedFor = stakedFor2;

    if (option == options.d90) stakedFor = stakedFor3;

    require(
      stakes[msg.sender].stakingTime + stakedFor <= block.timestamp,
      "Error: Too soon to unstake"
    );
    uint256 reward = calculateReward(msg.sender);
    uint256 amount = stakes[msg.sender].amount;
    TVL -= amount;
    RewardsOwed -= reward;
    RewardPool -= reward;
    stakes[msg.sender].rewardTaken = true;

    _withdraw(reward + amount);
  }

  /**
   * @dev calculates the rewards+stake for the given staker
   * @param staker is the staker we want the info for
   */
  function calculateReward(address staker) public view returns (uint256) {
    uint256 reward;
    options option = stakes[staker].option;

    if (option == options.d30) reward = reward1;

    if (option == options.d60) reward = reward2;

    if (option == options.d90) reward = reward3;

    return ((stakes[staker].amount * reward) / 100);
  }

  function getStakerInfo(address addr)
    public
    view
    returns (
      uint256,
      uint256,
      options,
      bool
    )
  {
    return (
      stakes[addr].amount,
      stakes[addr].stakingTime,
      stakes[addr].option,
      stakes[addr].rewardTaken
    );
  }

  function _withdraw(uint256 amount) internal {
    require(YOP.transfer(msg.sender, amount));
    emit withdrawHappened(msg.sender, amount);
  }

  event withdrawHappened(address indexed to, uint256 amount);
}
