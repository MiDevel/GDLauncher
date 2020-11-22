import React, { useState, useEffect, memo } from 'react';
import styled from 'styled-components';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { Button } from 'antd';
import { useSelector, useDispatch } from 'react-redux';
import { _getCurrentAccount } from 'src/renderer/common/selectors';
import EV from 'src/common/messageEvents';
import { openModal } from 'src/renderer/common/reducers/modals/actions';
import sendMessage from '../helpers/sendMessage';
import News from '../components/News';

const AddInstanceIcon = styled(Button)`
  position: fixed;
  bottom: 20px;
  left: 20px;
`;

const AccountContainer = styled(Button)`
  position: fixed;
  bottom: 20px;
  right: 20px;
  display: flex;
  align-items: center;
`;

const Home = () => {
  const dispatch = useDispatch();
  const account = useSelector(_getCurrentAccount);
  const news = useSelector(state => state.news);

  const openAddInstanceModal = defaultPage => {
    dispatch(openModal('AddInstance', { defaultPage }));
  };

  const openAccountModal = () => {
    dispatch(openModal('AccountsManager'));
  };

  const [profileImage, setProfileImage] = useState(null);

  useEffect(() => {
    const init = async () => {
      const appVersion = await sendMessage(EV.GET_APP_VERSION);
      sendMessage(EV.AUTH.SET_IS_NEW_USER, false);
      const lastVersionShown = await sendMessage(EV.GET_LAST_CHANGELOG_SHOWN);
      if (lastVersionShown !== appVersion) {
        sendMessage(EV.SET_LAST_CHANGELOG_SHOWN);
        dispatch(openModal('ChangeLogs'));
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (account) {
      sendMessage(EV.GET_PLAYER_FACE_SKIN, account?.skin)
        .then(setProfileImage)
        .catch(console.error);
    }
  }, [account]);

  return (
    <div>
      <News news={news} />
      {/* <Instances /> */}
      <AddInstanceIcon type="primary" onClick={() => openAddInstanceModal(0)}>
        <FontAwesomeIcon icon={faPlus} />
      </AddInstanceIcon>
      <AccountContainer type="primary" onClick={openAccountModal}>
        {profileImage ? (
          <img
            src={`data:image/jpeg;base64,${profileImage}`}
            css={`
              width: 15px;
              cursor: pointer;
              height: 15px;
              margin-right: 10px;
            `}
            alt="profile"
          />
        ) : (
          <div
            css={`
              width: 15px;
              height: 15px;
              background: ${props => props.theme.palette.grey[100]};
              margin-right: 10px;
            `}
          />
        )}
        {account && account.selectedProfile.name}
      </AccountContainer>
    </div>
  );
};

export default memo(Home);
