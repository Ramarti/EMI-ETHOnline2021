 /**
 *  @authors: [@clesaege]
 *  @reviewers: [@remedcu]
 *  @auditors: []
 *  @bounties: []
 *  @deployments: []
 */

pragma solidity ^0.8.4;

import "./Arbitrable.sol";

/** @title Arbitrator
 *  @author Clément Lesaege - <clement@lesaege.com>
 *  Arbitrator abstract contract.
 *  When developing arbitrator contracts we need to:
 *  -Define the functions for dispute creation (createDispute) and appeal (appeal). Don't forget to store the arbitrated contract and the disputeID (which should be unique, use nbDisputes).
 *  -Define the functions for cost display (arbitrationCost and appealCost).
 *  -Allow giving rulings. For this a function must call arbitrable.rule(disputeID, ruling).
 */
abstract contract Arbitrator {

    enum DisputeStatus {Waiting, Appealable, Solved}

    modifier requireArbitrationFee(bytes calldata _extraData) {
        require(msg.value >= arbitrationCost(_extraData), "Not enough ETH to cover arbitration costs.");
        _;
    }
    modifier requireAppealFee(uint _disputeID, bytes calldata _extraData) {
        require(msg.value >= appealCost(_disputeID, _extraData), "Not enough ETH to cover appeal costs.");
        _;
    }


    event DisputeCreation(uint indexed _disputeID, Arbitrable indexed _arbitrable);


    event AppealPossible(uint indexed _disputeID, Arbitrable indexed _arbitrable);


    event AppealDecision(uint indexed _disputeID, Arbitrable indexed _arbitrable);


    function createDispute(uint _choices, bytes calldata _extraData) public requireArbitrationFee(_extraData) payable returns(uint disputeID) {}


    function arbitrationCost(bytes calldata _extraData) public view returns(uint fee);


    function appeal(uint _disputeID, bytes calldata _extraData) public requireAppealFee(_disputeID,_extraData) payable {
        emit AppealDecision(_disputeID, Arbitrable(msg.sender));
    }

    function appealCost(uint _disputeID, bytes calldata _extraData) public view returns(uint fee);


    function appealPeriod(uint _disputeID) public view returns(uint start, uint end) {}


    function disputeStatus(uint _disputeID) public view returns(DisputeStatus status);


    function currentRuling(uint _disputeID) public view returns(uint ruling);
}